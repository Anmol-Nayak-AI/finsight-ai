import pytest
from app.database import async_session_factory
from app.rag.hybrid_retriever import HybridRAGRetriever

@pytest.mark.asyncio
async def test_sparse_bm25_retrieval():
    async with async_session_factory() as session:
        retriever = HybridRAGRetriever(session=session)
        await retriever.initialize_sparse_index()
        
        # Test BM25 keyword matching for KYC / Section 41
        sparse_hits = retriever._retrieve_sparse("Enhanced Due Diligence first-time beneficiaries", top_n=3)
        assert len(sparse_hits) > 0
        assert any("Master Direction - Know Your Customer" in h["document_title"] for h in sparse_hits)

@pytest.mark.asyncio
async def test_dense_vector_retrieval():
    async with async_session_factory() as session:
        retriever = HybridRAGRetriever(session=session)
        
        # Test dense semantic search
        dense_hits = await retriever._retrieve_dense("high value unusual wire transfers", top_n=3)
        assert len(dense_hits) > 0
        assert dense_hits[0]["score"] > 0.0

@pytest.mark.asyncio
async def test_hybrid_rrf_retrieval():
    async with async_session_factory() as session:
        retriever = HybridRAGRetriever(session=session)
        await retriever.initialize_sparse_index()
        
        query = (
            "High value transaction 850000 INR new beneficiary IMPS "
            "enhanced due diligence unusual velocity threshold section"
        )
        evidence = await retriever.retrieve_hybrid(query=query, top_k=3)
        
        assert len(evidence) > 0
        assert evidence[0].rrf_score > 0.0
        
        # Verify reciprocal rank fusion ranking attributes
        for item in evidence:
            assert item.document_title is not None
            assert item.circular_ref is not None
            assert item.content is not None
            assert item.sparse_rank >= 1 or item.dense_rank >= 1
