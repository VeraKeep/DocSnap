/**
 * MeetingSnap exporters — Markdown and PDF generation for meeting minutes /
 * action lists. Both run client-side with zero new dependencies: Markdown is
 * plain string generation, and PDF reuses the repo's existing jsPDF
 * (dynamically imported only when a download is requested, mirroring
 * src/searchablePdf.ts). No heavy new packages.
 */
import type { MeetingDetail, MeetingSegment } from "../types";

function confidenceNote(confidence: number): string {
  if (confidence < 0.6) return " — ⚠ low confidence, review";
  return "";
}

/** Format seconds as a compact human-readable timestamp: "12s", "1m 05s". */
export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${String(rem).padStart(2, "0")}s` : `${s}s`;
}

/** Format a segment as a labelled transcript line, e.g. `[12s–21s] text`. */
export function segmentLabel(seg: MeetingSegment): string {
  return `[${formatTimestamp(seg.start_sec)}–${formatTimestamp(seg.end_sec)}]`;
}

function segmentToLine(seg: MeetingSegment): string {
  const speaker = seg.speaker ? `${seg.speaker}: ` : "";
  return `- ${segmentLabel(seg)} ${speaker}${seg.text.trim()}`;
}

/** Speaker/attribution suffix for extracted items, when present. */
function speakerNote(speaker: string | null, unverified: boolean): string | null {
  if (!speaker) return null;
  return unverified ? ` (speaker ${speaker} — unverified)` : ` (${speaker})`;
}

/** Render the meeting's transcript (segments when present, else raw source). */
function transcriptLines(m: MeetingDetail): string[] {
  const segments = m.extraction?.segments ?? [];
  if (!segments.length) {
    return m.sourceText ? [`\`\`\`\n${m.sourceText}\n\`\`\``] : ["_No transcript._"];
  }
  const lines: string[] = [
    "> Transcript segments (timestamps; speaker labels become available in a future update):",
    "",
    ...segments.map(segmentToLine),
  ];
  return lines;
}

/** Render a meeting's full minutes as Markdown (preserving structured metadata). */
export function meetingToMarkdown(m: MeetingDetail): string {
  const ex = m.extraction;
  const lines: string[] = [];
  lines.push(`# ${m.title || "Untitled meeting"}`);
  if (m.createdAt) {
    lines.push(`\n_Date: ${new Date(m.createdAt).toLocaleString()}_`);
  }
  lines.push("");

  lines.push("## Executive summary");
  lines.push("");
  lines.push(ex.executive_summary || "No summary was extracted.");
  lines.push("");

  lines.push("## Transcript");
  lines.push("");
  lines.push(...transcriptLines(m));
  lines.push("");

  lines.push("## Decisions");
  lines.push("");
  if (ex.decisions.length) {
    for (const d of ex.decisions) {
      const sp = speakerNote(d.speaker, d.speakerUnverified);
      lines.push(`- **${d.decision}**${confidenceNote(d.confidence)}${sp ?? ""}`);
      if (d.reason) lines.push(`  - Reason: ${d.reason}`);
      if (d.participants.length) lines.push(`  - Participants: ${d.participants.join(", ")}`);
    }
  } else {
    lines.push("_No decisions were extracted._");
  }
  lines.push("");

  lines.push("## Action items");
  lines.push("");
  if (ex.action_items.length) {
    for (const a of ex.action_items) {
      const meta = [
        a.owner ? `Owner: ${a.owner}` : null,
        a.priority ? `Priority: ${a.priority}` : null,
        a.status ? `Status: ${a.status}` : null,
        a.due_date ? `Due: ${a.due_date}` : null,
        speakerNote(a.speaker, a.speakerUnverified),
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- **${a.task}**${confidenceNote(a.confidence)}${meta ? ` — ${meta}` : ""}`);
      if (a.dependencies.length) {
        lines.push(`  - Depends on: ${a.dependencies.join(", ")}`);
      }
    }
  } else {
    lines.push("_No action items were extracted._");
  }
  lines.push("");

  lines.push("## Action list (owners & due dates)");
  lines.push("");
  if (ex.action_items.length) {
    lines.push("| Task | Owner | Priority | Status | Due |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const a of ex.action_items) {
      const cell = (v: string | null | undefined) => v ?? "—";
      lines.push(
        `| ${cell(a.task).replace(/\|/g, "\\|")} | ${cell(a.owner).replace(/\|/g, "\\|")} | ${cell(a.priority)} | ${cell(a.status).replace(/\|/g, "\\|")} | ${cell(a.due_date)} |`,
      );
    }
  } else {
    lines.push("_No action items._");
  }
  lines.push("");

  lines.push("## Questions");
  lines.push("");
  if (ex.questions.length) {
    for (const q of ex.questions) {
      lines.push(`- ${q.answered ? "(answered) " : "(open) "}${q.question}${confidenceNote(q.confidence)}`);
    }
  } else {
    lines.push("_No questions were extracted._");
  }
  lines.push("");

  lines.push("## Risks");
  lines.push("");
  if (ex.risks.length) {
    for (const r of ex.risks) {
      const meta = [
        r.likelihood ? `likelihood ${r.likelihood}` : null,
        r.impact ? `impact ${r.impact}` : null,
        r.owner ? `owner ${r.owner}` : null,
        speakerNote(r.speaker, r.speakerUnverified),
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- **${r.description}**${confidenceNote(r.confidence)}${meta ? ` — ${meta}` : ""}`);
      if (r.mitigation) lines.push(`  - Mitigation: ${r.mitigation}`);
    }
  } else {
    lines.push("_No risks were extracted._");
  }

  return `${lines.join("\n")}\n`;
}

/** Render just the action list as Markdown (owners + due dates). */
export function actionListToMarkdown(m: MeetingDetail): string {
  const ex = m.extraction;
  const lines: string[] = [];
  lines.push(`# Action items — ${m.title || "Untitled meeting"}`);
  if (m.createdAt) lines.push(`\n_Date: ${new Date(m.createdAt).toLocaleString()}_`);
  lines.push("");
  if (!ex.action_items.length) {
    lines.push("No action items were extracted.");
    return `${lines.join("\n")}\n`;
  }
  lines.push("| Task | Owner | Priority | Status | Due |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const a of ex.action_items) {
    const cell = (v: string | null | undefined) => v ?? "—";
    lines.push(
      `| ${cell(a.task).replace(/\|/g, "\\|")} | ${cell(a.owner).replace(/\|/g, "\\|")} | ${cell(a.priority)} | ${cell(a.status).replace(/\|/g, "\\|")} | ${cell(a.due_date)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Trigger a browser download of a text payload as a file. */
export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Render a meeting's full minutes as a PDF via the repo's jsPDF dependency.
 * jsPDF is only imported when this runs (deferred like src/searchablePdf.ts).
 */
export async function meetingToPdf(m: MeetingDetail): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const ex = m.extraction;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const heading = (text: string, size = 13, color: [number, number, number] = [99, 102, 241]) => {
    ensureSpace(size + 12);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(text, margin, y);
    y += size + 8;
  };

  const body = (text: string, indent = 0, size = 10, color: [number, number, number] = [60, 60, 60]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(text, maxWidth - indent);
    for (const line of lines) {
      ensureSpace(size + 4);
      pdf.text(line as string, margin + indent, y);
      y += size + 4;
    }
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(17, 24, 39);
  const titleLines = pdf.splitTextToSize(m.title || "Untitled meeting", maxWidth);
  pdf.text(titleLines as string[], margin, y);
  y += titleLines.length * 22 + 6;
  if (m.createdAt) {
    body(`Date: ${new Date(m.createdAt).toLocaleString()}`, 0, 9, [110, 110, 110]);
    y += 4;
  }

  heading("Executive Summary");
  body(ex.executive_summary || "No summary was extracted.");

  heading("Transcript");
  const segments = ex.segments ?? [];
  if (segments.length) {
    for (const seg of segments) {
      const speaker = seg.speaker ? `${seg.speaker}: ` : "";
      body(`${segmentLabel(seg)} ${speaker}${seg.text.trim()}`, 6, 9, [90, 90, 90]);
      y += 2;
    }
    body("Speaker labels aren't available yet — they arrive in a future update.", 6, 8, [160, 160, 160]);
  } else if (m.sourceText) {
    body(m.sourceText, 6, 9, [90, 90, 90]);
  } else {
    body("No transcript.", 6, 9, [90, 90, 90]);
  }

  heading("Decisions");
  if (ex.decisions.length) {
    for (const d of ex.decisions) {
      const sp = d.speaker ? (d.speakerUnverified ? ` — ${d.speaker} (unverified)` : ` — ${d.speaker}`) : "";
      body(`• ${d.decision}${sp}`, 6, 10, [40, 40, 40]);
      if (d.reason) body(`  Reason: ${d.reason}`, 12, 9, [90, 90, 90]);
      if (d.participants.length) body(`  Participants: ${d.participants.join(", ")}`, 12, 9, [90, 90, 90]);
      y += 4;
    }
  } else {
    body("No decisions were extracted.");
  }

  heading("Action items");
  if (ex.action_items.length) {
    for (const a of ex.action_items) {
      const sp = a.speaker ? (a.speakerUnverified ? ` — ${a.speaker} (unverified)` : ` — ${a.speaker}`) : "";
      body(`• ${a.task}${sp}`, 6, 10, [40, 40, 40]);
      const meta = [
        a.owner ? `Owner: ${a.owner}` : null,
        a.priority ? `Priority: ${a.priority}` : null,
        a.status ? `Status: ${a.status}` : null,
        a.due_date ? `Due: ${a.due_date}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (meta) body(meta, 12, 9, [90, 90, 90]);
      y += 4;
    }
  } else {
    body("No action items were extracted.");
  }

  heading("Questions");
  if (ex.questions.length) {
    for (const q of ex.questions) {
      body(`• ${q.answered ? "(answered) " : "(open) "}${q.question}`, 6, 10, [40, 40, 40]);
    }
  } else {
    body("No questions were extracted.");
  }

  heading("Risks");
  if (ex.risks.length) {
    for (const r of ex.risks) {
      const sp = r.speaker ? (r.speakerUnverified ? ` — ${r.speaker} (unverified)` : ` — ${r.speaker}`) : "";
      body(`• ${r.description}${sp}`, 6, 10, [40, 40, 40]);
      if (r.mitigation) body(`  Mitigation: ${r.mitigation}`, 12, 9, [90, 90, 90]);
      y += 4;
    }
  } else {
    body("No risks were extracted.");
  }

  pdf.setProperties({ title: m.title || "Meeting minutes", author: "DocSnap © 2026 — VeraKeep™", creator: "MeetingSnap by DocSnap" });
  return pdf.output("blob");
}
