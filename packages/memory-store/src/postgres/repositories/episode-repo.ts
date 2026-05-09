import type { Episode, EpisodeSegment } from "@kirakira/memory-core";
import type postgres from "postgres";

import type { PgSql } from "../pg-sql.js";

export interface EpisodeRepoOptions {
  episodesTable?: string;
  segmentsTable?: string;
}

type EpisodeRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  session_id: string | null;
  source_type: string;
  start_at: Date | null;
  end_at: Date | null;
  body_blob_uri: string | null;
  segmentation_score: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type SegmentRow = {
  id: string;
  episode_id: string;
  offset_start: number;
  offset_end: number;
  text: string;
  entity_refs: string[] | null;
  created_at: Date;
};

function rowToEpisode(row: EpisodeRow): Episode | undefined {
  if (!row.start_at || !row.end_at || row.body_blob_uri === null || row.segmentation_score === null) {
    return undefined;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id ?? undefined,
    sourceType: row.source_type as Episode["sourceType"],
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    bodyBlobUri: row.body_blob_uri,
    segmentationScore: row.segmentation_score,
    metadata: row.metadata && Object.keys(row.metadata).length > 0 ? row.metadata : undefined,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToSegment(row: SegmentRow): EpisodeSegment {
  return {
    id: row.id,
    episodeId: row.episode_id,
    offsetStart: row.offset_start,
    offsetEnd: row.offset_end,
    text: row.text,
    entityRefs: row.entity_refs ?? [],
    createdAt: row.created_at.toISOString(),
  };
}

export class EpisodeRepository {
  private readonly episodes: string;
  private readonly segments: string;

  constructor(
    private readonly sql: PgSql,
    options?: EpisodeRepoOptions,
  ) {
    this.episodes = options?.episodesTable ?? "episodes";
    this.segments = options?.segmentsTable ?? "episode_segments";
  }

  async insertEpisode(episode: Episode): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.episodes)} (
        id,
        tenant_id,
        workspace_id,
        session_id,
        source_type,
        start_at,
        end_at,
        body_blob_uri,
        segmentation_score,
        metadata,
        created_at
      ) VALUES (
        ${episode.id}::uuid,
        ${episode.tenantId},
        ${episode.workspaceId},
        ${episode.sessionId ?? null},
        ${episode.sourceType},
        ${new Date(episode.startAt)},
        ${new Date(episode.endAt)},
        ${episode.bodyBlobUri},
        ${episode.segmentationScore},
        ${this.sql.json((episode.metadata ?? {}) as postgres.JSONValue)},
        ${new Date(episode.createdAt)}
      )
    `;
  }

  async insertSegment(segment: EpisodeSegment): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.segments)} (
        id,
        episode_id,
        offset_start,
        offset_end,
        text,
        entity_refs,
        created_at
      ) VALUES (
        ${segment.id}::uuid,
        ${segment.episodeId}::uuid,
        ${segment.offsetStart},
        ${segment.offsetEnd},
        ${segment.text},
        ${this.sql.array(segment.entityRefs)}::uuid[],
        ${new Date(segment.createdAt)}
      )
    `;
  }

  async findEpisodeById(id: string): Promise<Episode | undefined> {
    const rows = await this.sql<EpisodeRow[]>`
      SELECT * FROM ${this.sql(this.episodes)}
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToEpisode(row) : undefined;
  }

  async listEpisodesForWorkspace(tenantId: string, workspaceId: string, limit = 100): Promise<Episode[]> {
    const rows = await this.sql<EpisodeRow[]>`
      SELECT * FROM ${this.sql(this.episodes)}
      WHERE tenant_id = ${tenantId}
        AND workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.flatMap((r: EpisodeRow) => {
      const episode = rowToEpisode(r);
      return episode ? [episode] : [];
    });
  }

  async listSegments(episodeId: string): Promise<EpisodeSegment[]> {
    const rows = await this.sql<SegmentRow[]>`
      SELECT * FROM ${this.sql(this.segments)}
      WHERE episode_id = ${episodeId}::uuid
      ORDER BY offset_start ASC
    `;
    return rows.map(rowToSegment);
  }

  async deleteEpisode(id: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM ${this.sql(this.episodes)}
      WHERE id = ${id}::uuid
    `;
    return result.count;
  }
}
