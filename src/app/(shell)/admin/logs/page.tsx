"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getActiveSearchTerm, LOGS_PAGE_SIZE, MIN_SEARCH_LENGTH } from "../_lib/constants";
import type { LogFilters, LogItem } from "../_lib/types";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsCount, setLogsCount] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [filters, setFilters] = useState<LogFilters>({
    awarded_at: "",
    stamp_name: "",
    collection_name: "",
    event_name: "",
    delivered_to: "",
    delivered_by: "",
    claim_code: "",
  });
  const [submittedFilters, setSubmittedFilters] = useState<LogFilters>({
    awarded_at: "",
    stamp_name: "",
    collection_name: "",
    event_name: "",
    delivered_to: "",
    delivered_by: "",
    claim_code: "",
  });

  const appliedFilters = useMemo(
    () => ({
      awarded_at: submittedFilters.awarded_at,
      stamp_name: getActiveSearchTerm(submittedFilters.stamp_name),
      collection_name: getActiveSearchTerm(submittedFilters.collection_name),
      event_name: getActiveSearchTerm(submittedFilters.event_name),
      delivered_to: getActiveSearchTerm(submittedFilters.delivered_to),
      delivered_by: getActiveSearchTerm(submittedFilters.delivered_by),
      claim_code: getActiveSearchTerm(submittedFilters.claim_code),
    }),
    [submittedFilters],
  );

  const canSearch = useMemo(
    () => Object.values(filters).some((value) => value.trim().length > 0),
    [filters],
  );

  const hasAppliedFilters = useMemo(
    () => Object.values(submittedFilters).some((value) => value.trim().length > 0),
    [submittedFilters],
  );

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);

    try {
      const normalizeRpcFilter = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : null;
      };

      const { data, error } = await supabase.rpc("admin_get_logs", {
        p_awarded_at: appliedFilters.awarded_at || null,
        p_stamp_name: normalizeRpcFilter(appliedFilters.stamp_name),
        p_collection_name: normalizeRpcFilter(appliedFilters.collection_name),
        p_event_name: normalizeRpcFilter(appliedFilters.event_name),
        p_delivered_to: normalizeRpcFilter(appliedFilters.delivered_to),
        p_delivered_by: normalizeRpcFilter(appliedFilters.delivered_by),
        p_claim_code: normalizeRpcFilter(appliedFilters.claim_code),
        p_page: logsPage,
        p_page_size: LOGS_PAGE_SIZE,
      });

      if (error) throw error;

      const rows =
        ((data as Array<{
          id: string;
          awarded_at: string;
          claim_code: string;
          event_name: string;
          collection_name: string;
          stamp_name: string;
          delivered_to: string;
          delivered_by: string;
          total_count: number;
        }> | null) ?? []);

      setLogs(
        rows.map((row) => ({
          id: row.id,
          awarded_at: row.awarded_at,
          claim_code: row.claim_code,
          event_name: row.event_name,
          collection_name: row.collection_name,
          stamp_name: row.stamp_name,
          delivered_to: row.delivered_to,
          delivered_by: row.delivered_by,
        })),
      );
      setLogsCount(rows[0]?.total_count ?? 0);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudieron cargar los logs.");
      setLogs([]);
      setLogsCount(0);
    } finally {
      setLogsLoading(false);
    }
  }, [appliedFilters, logsPage]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(logsCount / LOGS_PAGE_SIZE));

  const handleSearch = () => {
    setFeedback(null);
    setLogsPage(1);
    setSubmittedFilters(filters);
  };

  const handleClear = () => {
    const emptyFilters: LogFilters = {
      awarded_at: "",
      stamp_name: "",
      collection_name: "",
      event_name: "",
      delivered_to: "",
      delivered_by: "",
      claim_code: "",
    };

    setFeedback(null);
    setLogsPage(1);
    setFilters(emptyFilters);
    setSubmittedFilters(emptyFilters);
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Logs</h2>

      <div className="admin-box-header">
        <div className="admin-log-filters">
          <input
            className="admin-search-input"
            type="date"
            value={filters.awarded_at}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, awarded_at: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Stamp"
            value={filters.stamp_name}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, stamp_name: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Coleccion"
            value={filters.collection_name}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, collection_name: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Evento"
            value={filters.event_name}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, event_name: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Entregada a"
            value={filters.delivered_to}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, delivered_to: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Entregada por"
            value={filters.delivered_by}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, delivered_by: event.target.value }))
            }
          />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Claim code"
            value={filters.claim_code}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, claim_code: event.target.value }))
            }
          />
          <button
            type="button"
            className="admin-mini-btn admin-mini-btn-primary"
            onClick={handleSearch}
            disabled={logsLoading || !canSearch}
          >
            Buscar
          </button>
          {hasAppliedFilters ? (
            <button
              type="button"
              className="admin-mini-btn"
              onClick={handleClear}
              disabled={logsLoading}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Fecha de entrega</th>
              <th>Stamp</th>
              <th>De la coleccion</th>
              <th>En el evento</th>
              <th>Entregada a</th>
              <th>Entregada por</th>
              <th>Claim code</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.awarded_at).toLocaleString()}</td>
                <td>{log.stamp_name}</td>
                <td>{log.collection_name}</td>
                <td>{log.event_name}</td>
                <td>{log.delivered_to}</td>
                <td>{log.delivered_by}</td>
                <td>{log.claim_code}</td>
              </tr>
            ))}
            {!logs.length && !logsLoading ? (
              <tr>
                <td colSpan={7} className="admin-muted">
                  No hay resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="admin-log-pagination">
        <button
          type="button"
          className="admin-mini-btn"
          onClick={() => setLogsPage((current) => Math.max(1, current - 1))}
          disabled={logsPage === 1 || logsLoading}
        >
          Anterior
        </button>
        <span className="admin-muted admin-muted-small">
          Pagina {logsPage} de {totalPages}
        </span>
        <button
          type="button"
          className="admin-mini-btn"
          onClick={() => setLogsPage((current) => Math.min(totalPages, current + 1))}
          disabled={logsPage >= totalPages || logsLoading}
        >
          Siguiente
        </button>
      </div>
    </article>
  );
}

