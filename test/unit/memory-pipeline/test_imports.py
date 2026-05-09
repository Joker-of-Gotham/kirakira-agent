def test_import_package() -> None:
    import kirakira_memory_pipeline as m

    assert m.__version__ == "0.1.0"
    from kirakira_memory_pipeline.segmentation.episode_segmenter import EpisodeSegmenter
    from kirakira_memory_pipeline.embedding.openai_embedder import OpenAIEmbedder

    assert EpisodeSegmenter is not None
    assert OpenAIEmbedder is not None
