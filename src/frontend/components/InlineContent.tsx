"use client";

import React from "react";
import { ExternalLink } from "lucide-react";

interface Source {
  id: number;
  url?: string;
  source?: string;
  title?: string;
}

interface InlineContentProps {
  text: string;
  sources: Source[];
}

function renderMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    if (isTableStart(lines, li)) {
      // ponytail: skip table lines — semua tabel ditampilkan di side panel
      while (li < lines.length && lines[li].trim().startsWith('|')) {
        li++;
      }
      li--;
      continue;
    }

    // Heading ###
    const headingMatch = line.match(/^###\s+(.+)$/);
    if (headingMatch) {
      parts.push(<h3 key={`h3-${li}`} className="text-base font-bold mt-3 mb-1" style={{ color: "var(--text-primary)" }}>{renderInline(headingMatch[1])}</h3>);
      continue;
    }

    // Heading ##
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      parts.push(<h2 key={`h2-${li}`} className="text-lg font-bold mt-4 mb-2" style={{ color: "var(--text-primary)" }}>{renderInline(h2Match[1])}</h2>);
      continue;
    }

    // Bullet point - or *
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      parts.push(
        <div key={`bullet-${li}`} className="flex items-start gap-2 ml-1 my-0.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--accent)" }} />
          <span>{renderInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      parts.push(
        <div key={`num-${li}`} className="flex items-start gap-2 ml-1 my-0.5">
          <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }}>{numMatch[1]}.</span>
          <span>{renderInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      parts.push(<div key={`br-${li}`} className="h-2" />);
      continue;
    }

    // Horizontal line
    if (line.match(/^---+$/)) {
      parts.push(<hr key={`hr-${li}`} className="my-3" style={{ borderColor: "var(--border)" }} />);
      continue;
    }

    // Regular paragraph
    parts.push(<p key={`p-${li}`} className="mb-1">{renderInline(line)}</p>);
  }

  return parts;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index] || '';
  const next = lines[index + 1] || '';
  return current.trim().startsWith('|') && current.includes('|') && isSeparatorRow(next);
}

function renderTable(lines: string[], key: string): React.ReactNode {
  const header = parseTableRow(lines[0]);
  const rows = lines.slice(2).filter(line => line.trim()).map(parseTableRow);

  return (
    <div key={key} className="my-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="min-w-full text-xs border-collapse">
        <thead style={{ backgroundColor: "var(--bg-card)" }}>
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold border-b" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              {header.map((_, ci) => (
                <td key={ci} className="px-3 py-2 align-top" style={{ color: "var(--text-primary)" }}>
                  {renderInline(row[ci] || '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Parse markdown links [text](url) first — before bold
  const linkSplit = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  linkSplit.forEach((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      elements.push(
        <a key={`l-${i}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline transition-colors hover:opacity-70"
          style={{ color: "var(--accent)" }}>
          {linkMatch[1]}<ExternalLink size={10} />
        </a>
      );
    } else {
      // Then parse bold inside non-link parts
      const boldSplit = part.split(/(\*\*[^*]+\*\*)/g);
      boldSplit.forEach((bp, j) => {
        const boldMatch = bp.match(/^\*\*(.+)\*\*$/);
        if (boldMatch) {
          elements.push(<strong key={`b-${i}-${j}`} className="font-semibold">{boldMatch[1]}</strong>);
        } else {
          elements.push(<span key={`t-${i}-${j}`}>{bp}</span>);
        }
      });
    }
  });
  return elements;
}

export default function InlineContent({ text, sources }: InlineContentProps) {
  const segments = text.split(/(\[\d+\])/g);

  const rendered = segments.map((segment, idx) => {
    const citeMatch = segment.match(/^\[(\d+)\]$/);
    if (citeMatch) {
      const id = parseInt(citeMatch[1]);
      const source = sources.find(s => s.id === id);
      if (source && source.url) {
        return (
          <a
            key={`cite-${idx}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-bold mx-0.5 px-1 rounded transition-colors hover:opacity-70"
            style={{ color: "var(--accent)" }}
            title={`${source.title || source.source || "Sumber"} — ${source.source || ""}`}
          >
            [{id}]<ExternalLink size={10} />
          </a>
        );
      }
      return <sup key={`cite-${idx}`} style={{ color: "var(--accent)", fontWeight: 600 }}>[{id}]</sup>;
    }

    return <span key={`md-${idx}`}>{renderMarkdown(segment)}</span>;
  });

  return <div className="leading-relaxed">{rendered}</div>;
}
