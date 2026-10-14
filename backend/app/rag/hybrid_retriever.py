import asyncio
import os
from typing import List, Dict, Any
from rank_bm25 import BM25Okapi
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

class RegulatoryEvidence(BaseModel):
    chunk_id: int
    document_title: str
    circular_ref: str
    section: str
    content: str
    rrf_score: float
    dense_rank: int = Field(default=999)
    sparse_rank: int = Field(default=999)

class HybridRAGRetriever:
    def __init__(self, session: AsyncSession, k_rrf: int = 60):
        self.session = session
        self.k_rrf = k_rrf
        self.embeddings = OpenAIEmbeddings(model="text-embedding-3-small") if os.getenv("OPENAI_API_KEY") else None
        self.bm25_index: BM25Okapi = None
        self.corpus_chunks: List[Dict[str, Any]] = []

    async def initialize_sparse_index(self):
        """Loads regulatory corpus into memory for BM25 keyword matching."""
        query = text("""
            SELECT id, document_title, circular_ref, section, content 
            FROM regulatory_chunks
        """)
        result = await self.session.execute(query)
        rows = result.fetchall()
        
        self.corpus_chunks = [
            {
                "id": r.id,
                "document_title": r.document_title,
                "circular_ref": r.circular_ref,
                "section": r.section,
                "content": r.content
            }
            for r in rows
        ]
        
        tokenized_corpus = [doc["content"].lower().split() for doc in self.corpus_chunks]
        if tokenized_corpus:
            self.bm25_index = BM25Okapi(tokenized_corpus)

    async def _retrieve_dense(self, query: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """Executes pgvector HNSW cosine similarity search."""
        if self.embeddings is None:
            return []
        query_vector = await self.embeddings.aembed_query(query)
        sql = text("""
            SELECT id, document_title, circular_ref, section, content,
                   1 - (embedding <=> CAST(:query_vector AS vector)) as cosine_similarity
            FROM regulatory_chunks
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:query_vector AS vector) ASC
            LIMIT :top_n
        """)
        result = await self.session.execute(sql, {
            "query_vector": str(query_vector),
            "top_n": top_n
        })
        return [
            {
                "id": r.id,
                "document_title": r.document_title,
                "circular_ref": r.circular_ref,
                "section": r.section,
                "content": r.content,
                "score": float(r.cosine_similarity)
            }
            for r in result.fetchall()
        ]

    def _retrieve_sparse(self, query: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """Executes BM25 keyword matching."""
        if not self.bm25_index or not self.corpus_chunks:
            return []
            
        tokenized_query = query.lower().split()
        scores = self.bm25_index.get_scores(tokenized_query)
        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_n]
        
        sparse_results = []
        for idx in ranked_indices:
            if scores[idx] > 0.0:
                item = dict(self.corpus_chunks[idx])
                item["score"] = float(scores[idx])
                sparse_results.append(item)
        return sparse_results

    async def retrieve_hybrid(self, query: str, top_k: int = 4) -> List[RegulatoryEvidence]:
        """Runs Dense and BM25 simultaneously and merges using Reciprocal Rank Fusion."""
        dense_task = asyncio.create_task(self._retrieve_dense(query, top_n=15))
        sparse_results = self._retrieve_sparse(query, top_n=15)
        try:
            dense_results = await dense_task
        except Exception:
            # Sparse statutory evidence remains available during embedding API
            # outages, so the investigation stays explainable and operational.
            dense_results = []

        rrf_map: Dict[int, Dict[str, Any]] = {}

        for rank, doc in enumerate(dense_results, start=1):
            doc_id = doc["id"]
            if doc_id not in rrf_map:
                rrf_map[doc_id] = {
                    "raw": doc,
                    "rrf_score": 0.0,
                    "dense_rank": rank,
                    "sparse_rank": 999
                }
            rrf_map[doc_id]["rrf_score"] += 1.0 / (self.k_rrf + rank)

        for rank, doc in enumerate(sparse_results, start=1):
            doc_id = doc["id"]
            if doc_id not in rrf_map:
                rrf_map[doc_id] = {
                    "raw": doc,
                    "rrf_score": 0.0,
                    "dense_rank": 999,
                    "sparse_rank": rank
                }
            else:
                rrf_map[doc_id]["sparse_rank"] = rank
            rrf_map[doc_id]["rrf_score"] += 1.0 / (self.k_rrf + rank)

        sorted_docs = sorted(
            rrf_map.values(), 
            key=lambda x: x["rrf_score"], 
            reverse=True
        )[:top_k]

        return [
            RegulatoryEvidence(
                chunk_id=item["raw"]["id"],
                document_title=item["raw"]["document_title"],
                circular_ref=item["raw"]["circular_ref"],
                section=item["raw"]["section"],
                content=item["raw"]["content"],
                rrf_score=round(item["rrf_score"], 5),
                dense_rank=item["dense_rank"],
                sparse_rank=item["sparse_rank"]
            )
            for item in sorted_docs
        ]
