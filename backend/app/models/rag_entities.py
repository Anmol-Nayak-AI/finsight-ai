from sqlalchemy import Column, Integer, String, Text, Index
from pgvector.sqlalchemy import Vector
from app.models.entities import Base

class RegulatoryDocumentChunk(Base):
    __tablename__ = "regulatory_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_title = Column(String(255), nullable=False, index=True)
    regulator = Column(String(64), nullable=False, index=True)  # RBI, SEBI, FIU-IND
    circular_ref = Column(String(128), nullable=False, index=True)
    section = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    
    # 1536 Dimensions matching text-embedding-3-small
    # Text-only rows keep sparse BM25 retrieval operational when an embedding
    # provider is unavailable; seed_corpus.py enriches these rows later.
    embedding = Column(Vector(1536), nullable=True)

    __table_args__ = (
        Index(
            "ix_regulatory_chunks_embedding_hnsw",
            embedding,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"}
        ),
    )
