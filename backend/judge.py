import logging
import time
import json
import re
from typing import List, Dict
from groq import Groq

logger = logging.getLogger(__name__)

# Groq free tier: 6,000 TPM for llama-3.1-8b-instant
# Each call: ~450 tokens prompt + ~150 response = ~600 tokens
# 10 chunks × 600 = 6,000 tokens — process with ~6s delay between calls
TOKENS_PER_CALL = 600
TPM_LIMIT       = 5500
MIN_DELAY       = 60 / (TPM_LIMIT / TOKENS_PER_CALL)  # ~6.5s
CHUNK_PREVIEW   = 300


class LLMJudge:

    def __init__(self, groq_client: Groq, model: str):
        self.client = groq_client
        self.model  = model

    # ------------------------------------------------------------------
    # Summarize ALL top-10 chunks — no elimination
    # Returns all chunks enriched with law_summary + inferred doc name
    # ------------------------------------------------------------------

    def filter(
        self,
        chunks: List[Dict],
        product_description: str,
        domain: str,
    ) -> List[Dict]:

        if not chunks:
            return []

        # Take top 10 by vector similarity — keep ALL of them
        pool = sorted(
            chunks,
            key=lambda x: x.get("similarity_score", 0),
            reverse=True,
        )[:10]

        logger.info(f"Judge: summarizing all {len(pool)} chunks (no elimination)")

        summarized = []
        for i, chunk in enumerate(pool):
            result = self._summarize_chunk(chunk, product_description, domain)
            if result:
                summarized.append(result)
            # Rate limit delay between calls
            if i < len(pool) - 1:
                time.sleep(MIN_DELAY)

        logger.info(f"Judge complete: {len(summarized)} chunks summarized")
        return summarized

    # ------------------------------------------------------------------
    # Summarize one chunk + infer document name from its text
    # ------------------------------------------------------------------

    def _summarize_chunk(
        self,
        chunk: Dict,
        product_description: str,
        domain: str,
    ) -> Dict:

        chunk_text    = chunk["chunk_text"][:CHUNK_PREVIEW]
        idea_preview  = product_description[:300]
        section_title = chunk.get("section_title", "")

        prompt = (
            f"Product: {idea_preview}\n"
            f"Domain: {domain}\n\n"
            f"Legal document excerpt:\n"
            f"Section: {section_title}\n"
            f"Country: {chunk.get('country', '?')}\n"
            f"Text: {chunk_text}\n\n"
            f"Task:\n"
            f"1. Summarize the legal rule in this excerpt in one sentence.\n"
            f"2. Infer the full name of the legal document this excerpt is from "
            f"(e.g. 'Health Insurance Portability and Accountability Act', "
            f"'General Data Protection Regulation'). "
            f"Base this on the section title, country, and text content. "
            f"Do NOT just say 'Section X'. Give the actual law name.\n"
            f"3. Rate relevance to the product (0.0-1.0).\n\n"
            f'Important: data privacy laws, financial regulations, consumer protection laws, '
            f'AI regulations, and interoperability frameworks are ALWAYS relevant to fintech, '
            f'healthcare, and AI products. Never score these below 0.7 for such products. '
            f'Reply JSON only: {{"relevant": true, "law_summary": "one sentence", "relevance_score": ACTUALLY_CALCULATE_0_TO_1_BASED_ON_PRODUCT_RELEVANCE}}'
        )

        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=150,
                )
                text   = response.choices[0].message.content
                parsed = self._parse_json(text)

                if not parsed:
                    # Return chunk with fallback values rather than dropping it
                    return self._make_result(chunk, {
                        "law_summary":    "Legal regulation relevant to this product domain.",
                        "document_name":  section_title or chunk.get("document_id", "Unknown Document"),
                        "relevance_score": chunk.get("similarity_score", 0.7),
                    })

                return self._make_result(chunk, parsed)

            except Exception as e:
                if "429" in str(e) or "rate_limit" in str(e).lower():
                    wait = 30 * (attempt + 1)
                    logger.warning(f"Rate limit, backing off {wait}s (attempt {attempt+1}/3)")
                    time.sleep(wait)
                else:
                    logger.error(f"Judge summarize error: {e}")
                    # Still return chunk with fallback rather than None
                    return self._make_result(chunk, {
                        "law_summary":    "Legal regulation relevant to this product domain.",
                        "document_name":  section_title or chunk.get("document_id", "Unknown Document"),
                        "relevance_score": chunk.get("similarity_score", 0.7),
                    })

        # Max retries — return chunk with fallback
        return self._make_result(chunk, {
            "law_summary":    "Legal regulation relevant to this product domain.",
            "document_name":  section_title or chunk.get("document_id", "Unknown Document"),
            "relevance_score": chunk.get("similarity_score", 0.7),
        })

    def _make_result(self, chunk: Dict, parsed: Dict) -> Dict:
        return {
            "relevant":        True,  # All chunks kept
            "relevance_score": float(parsed.get("relevance_score", chunk.get("similarity_score", 0.7))),
            "law_summary":     parsed.get("law_summary", ""),
            "document_name": parsed.get("document_name", chunk.get("section_title", chunk.get("document_id", "Unknown"))),
            "source_section":  chunk.get("section_title", "Unknown"),
            "source_document": chunk.get("document_id", "Unknown"),
            "country":         chunk.get("country", "Unknown"),
            "publish_date":    chunk.get("publish_date", "Unknown"),
            "chunk_text":      chunk["chunk_text"],
        }

    def _parse_json(self, text: str) -> dict:
        try:
            match = re.search(r"\{.*\}", text.strip(), re.DOTALL)
            if not match:
                return {}
            return json.loads(match.group())
        except Exception as e:
            logger.error(f"Judge JSON parse error: {e} | raw: {text[:80]}")
            return {}