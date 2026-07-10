"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";

type TablePanelRow = { title: string; url: string; content: string };
type TablePanelData = { type: "sql" | "rag"; rows: TablePanelRow[] };

interface TablePanelProps {
  data: TablePanelData;
  onClose: () => void;
}

export default function TablePanel({ data, onClose }: TablePanelProps) {
  const [titleWidth, setTitleWidth] = useState(250);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, w: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      dragStart.current = { x: e.clientX, w: titleWidth };

      const handleMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        const delta = e.clientX - dragStart.current.x;
        setTitleWidth(Math.max(120, Math.min(600, dragStart.current.w + delta)));
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [titleWidth],
  );

  useEffect(() => {
    return () => {
      dragging.current = false;
    };
  }, []);

  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden flex flex-col"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {data.type === "sql" ? "Data Tabel" : "Sumber Berita"}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead
            className="sticky top-0 z-10"
            style={{ backgroundColor: "var(--bg-card)" }}
          >
            <tr>
              <th
                className="px-3 py-2 text-left font-semibold border-b relative select-none"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                  width: titleWidth,
                  minWidth: 120,
                  maxWidth: 600,
                }}
              >
                Judul
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:opacity-100 opacity-0 transition-opacity"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              </th>
              <th
                className="px-3 py-2 text-left font-semibold border-b"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                Konten
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-8 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tidak ada data
                </td>
              </tr>
            ) : (
              data.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td
                    className="px-3 py-2 align-top"
                    style={{
                      width: titleWidth,
                      minWidth: 120,
                      maxWidth: 600,
                    }}
                  >
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-70 transition-opacity font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        {row.title}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-primary)" }}>
                        {row.title}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 align-top break-words relative"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <div className="line-clamp-4 overflow-hidden"
                      style={{
                        WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                        maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                      }}>
                      {row.content || "-"}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t flex-shrink-0 text-[10px] text-center"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Klik judul untuk baca lebih lanjut
      </div>
    </div>
  );
}
