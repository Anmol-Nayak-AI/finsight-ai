import asyncio
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text
from app.database import async_session_factory, engine
from app.models.entities import Base
from app.models.rag_entities import RegulatoryDocumentChunk

REGULATORY_CORPUS = [
    {
        "document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016",
        "regulator": "RBI",
        "circular_ref": "RBI/DBR/2015-16/18 Master Direction DBR.AML.BC.No.81/14.01.001/2015-16",
        "section": "Section 41 - Monitoring of Transactions",
        "content": (
            "Regulated Entities shall pay special attention to all complex, unusually large transactions "
            "and all unusual patterns of transactions, which have no apparent economic or visible lawful purpose. "
            "Transactions involving sudden transfers exceeding 5,00,000 INR to first-time beneficiaries without verified "
            "prior linkage require Enhanced Due Diligence (EDD) and mandatory suspicion review within 48 hours."
        )
    },
    {
        "document_title": "Prevention of Money-Laundering Rules, 2005",
        "regulator": "FIU-IND",
        "circular_ref": "PMLA Rule 3, Notification No. 9/2005",
        "section": "Rule 3(1)(D) - Suspicious Transaction Reporting",
        "content": (
            "Every reporting entity shall maintain records of all suspicious transactions whether or not made in cash. "
            "A suspicious transaction includes a transaction which gives rise to a reasonable ground of suspicion that "
            "it may involve proceeds of an offense specified in the Schedule to the Act, or where transactions are conducted "
            "in abnormal velocity compared to historical account turnover."
        )
    },
    {
        "document_title": "Master Circular - Frauds - Classification and Reporting",
        "regulator": "RBI",
        "circular_ref": "RBI/DBS/2023-24/108 DBS.CO.CFMC.BC.No.1/23.04.001/2023-24",
        "section": "Clause 4.2 - Velocity Breaches in Retail Payment Gateways",
        "content": (
            "Payment aggregators and banks must establish real-time transaction velocity filters. "
            "An account exhibiting a 10x deviation from rolling 90-day transaction volume coupled with newly added IMPS beneficiaries "
            "must be placed in high-risk provisional hold pending manual confirmation from the account holder."
        )
    }
]

async def seed():
    # Create tables if not present
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    
    async with async_session_factory() as session:
        # Clear existing to avoid duplicate seeds during testing
        await session.execute(text("DELETE FROM regulatory_chunks;"))
        for doc in REGULATORY_CORPUS:
            emb = await embeddings.aembed_query(doc["content"])
            chunk = RegulatoryDocumentChunk(
                document_title=doc["document_title"],
                regulator=doc["regulator"],
                circular_ref=doc["circular_ref"],
                section=doc["section"],
                content=doc["content"],
                embedding=emb
            )
            session.add(chunk)
        await session.commit()
    print("Regulatory corpus successfully seeded with HNSW vector embeddings.")

if __name__ == "__main__":
    asyncio.run(seed())
