"""Kirakira agent memory pipeline: segmentation, extraction, embedding, and materialization."""

from __future__ import annotations

__version__ = "0.1.0"

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.embedding.batch_manager import EmbeddingBatchManager
from kirakira_memory_pipeline.embedding.bge_embedder import BGEM3Embedder
from kirakira_memory_pipeline.embedding.embedder import Embedder
from kirakira_memory_pipeline.embedding.openai_embedder import OpenAIEmbedder
from kirakira_memory_pipeline.extraction.belief_candidate import BeliefCandidate, BeliefCandidateGenerator
from kirakira_memory_pipeline.extraction.entity_extractor import EntityExtractor
from kirakira_memory_pipeline.extraction.fact_extractor import Fact, FactExtractor
from kirakira_memory_pipeline.extraction.preference_extractor import Preference, PreferenceExtractor
from kirakira_memory_pipeline.materializer.blob_materializer import BlobMaterializer
from kirakira_memory_pipeline.materializer.graph_materializer import GraphMaterializer
from kirakira_memory_pipeline.materializer.vector_materializer import VectorMaterializer
from kirakira_memory_pipeline.reflect.belief_updater import BeliefUpdater
from kirakira_memory_pipeline.reflect.observation_consolidator import ObservationConsolidator
from kirakira_memory_pipeline.reflect.predict_calibrate import PredictCalibrateScorer, predict_calibrate_from_payload
from kirakira_memory_pipeline.scoring.importance_predictor import ImportancePredictor
from kirakira_memory_pipeline.scoring.retention_scorer import RetentionScorer
from kirakira_memory_pipeline.segmentation.episode_segmenter import Episode, EpisodeSegmenter
from kirakira_memory_pipeline.worker import MemoryPipelineWorker, run_worker

__all__ = [
    "__version__",
    "BGEM3Embedder",
    "BeliefCandidate",
    "BeliefCandidateGenerator",
    "BeliefUpdater",
    "BlobMaterializer",
    "Embedder",
    "EmbeddingBatchManager",
    "EntityExtractor",
    "Episode",
    "EpisodeSegmenter",
    "Fact",
    "FactExtractor",
    "GraphMaterializer",
    "ImportancePredictor",
    "MemoryPipelineConfig",
    "MemoryPipelineWorker",
    "ObservationConsolidator",
    "OpenAIEmbedder",
    "PredictCalibrateScorer",
    "Preference",
    "PreferenceExtractor",
    "RetentionScorer",
    "VectorMaterializer",
    "predict_calibrate_from_payload",
    "run_worker",
]
