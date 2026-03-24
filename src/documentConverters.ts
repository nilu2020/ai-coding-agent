import PDFDocument from "pdfkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
} from "docx";

// ── Shared markdown parser ─────────────────────────────────────────────────────

interface ParsedLine {
  type:
    | "h1" | "h2" | "h3" | "h4"
    | "bullet" | "numbered"
    | "codeBlock" | "tableRow" | "tableSep"
    | "blockquote" | "hr" | "blank" | "text";
  content: string;
  level?: number;
}

function parseMarkdown(md: string): ParsedLine[] {
  const lines = md.split("\n");
  const result: ParsedLine[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (const raw of lines) {
    const line = raw;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        result.push({ type: "codeBlock", content: codeBuffer.join("\n") });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    if (/^#{4}\s/.test(line))   { result.push({ type: "h4", content: line.replace(/^####\s*/, "") }); continue; }
    if (/^#{3}\s/.test(line))   { result.push({ type: "h3", content: line.replace(/^###\s*/, "") }); continue; }
    if (/^#{2}\s/.test(line))   { result.push({ type: "h2", content: line.replace(/^##\s*/, "") }); continue; }
    if (/^#\s/.test(line))      { result.push({ type: "h1", content: line.replace(/^#\s*/, "") }); continue; }
    if (/^[-*]\s/.test(line))   { result.push({ type: "bullet", content: line.replace(/^[-*]\s*/, "") }); continue; }
    if (/^\d+\.\s/.test(line))  { result.push({ type: "numbered", content: line.replace(/^\d+\.\s*/, "") }); continue; }
    if (/^>\s/.test(line))      { result.push({ type: "blockquote", content: line.replace(/^>\s*/, "") }); continue; }
    if (/^---+$/.test(line))    { result.push({ type: "hr", content: "" }); continue; }
    if (/^\|/.test(line))       { result.push({ type: /^[\s|:-]+$/.test(line.replace(/\|/g,"")) ? "tableSep" : "tableRow", content: line }); continue; }
    if (!line.trim())           { result.push({ type: "blank", content: "" }); continue; }

    result.push({ type: "text", content: line });
  }

  if (inCodeBlock && codeBuffer.length) {
    result.push({ type: "codeBlock", content: codeBuffer.join("\n") });
  }

  return result;
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// ── PDF Export ─────────────────────────────────────────────────────────────────

const PDF_COLORS = {
  primary:    "#2563EB",
  text:       "#1E293B",
  muted:      "#64748B",
  codeText:   "#334155",
  codeBg:     "#F8FAFC",
  ruleLine:   "#CBD5E1",
  tableBg:    "#EFF6FF",
  tableHead:  "#2563EB",
};

export function toPdf(
  mdContent: string,
  title: string,
  requirements: string
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 56, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const W = doc.page.width - 112; // usable width

    const ts = new Date().toLocaleString();

    // ── Cover header ──
    doc.rect(0, 0, doc.page.width, 100).fill(PDF_COLORS.primary);
    doc
      .fillColor("#FFFFFF")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(title, 56, 28, { width: W, align: "left" });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("rgba(255,255,255,0.8)")
      .text(`Generated: ${ts}  •  AI Architect Intelligence`, 56, 64, { width: W });

    doc.moveDown(2.5);

    // ── Requirements box ──
    if (requirements.trim()) {
      const reqText = requirements.slice(0, 400).replace(/\n/g, " ");
      doc
        .rect(56, doc.y, W, 1)
        .fill(PDF_COLORS.primary);
      doc.moveDown(0.4);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(PDF_COLORS.primary)
        .text("REQUIREMENTS", 56, doc.y);
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(PDF_COLORS.muted)
        .text(reqText + (requirements.length > 400 ? "…" : ""), 56, doc.y + 2, { width: W });
      doc.moveDown(1);
      doc.rect(56, doc.y, W, 1).fill(PDF_COLORS.ruleLine);
      doc.moveDown(1);
    }

    // ── Content ──
    const parsed = parseMarkdown(mdContent);
    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = () => {
      if (!tableRows.length) return;
      const colCount = Math.max(...tableRows.map((r) => r.length));
      const colW = W / colCount;
      const headerRow = tableRows[0];
      const bodyRows = tableRows.slice(1);

      // Header row
      headerRow.forEach((cell, i) => {
        doc
          .rect(56 + i * colW, doc.y, colW, 18)
          .fill(PDF_COLORS.tableHead);
        doc
          .fillColor("#FFFFFF")
          .fontSize(8)
          .font("Helvetica-Bold")
          .text(stripInline(cell), 59 + i * colW, doc.y - 15, { width: colW - 6, ellipsis: true });
      });
      doc.moveDown(0.2);

      // Body rows
      bodyRows.forEach((row, ri) => {
        const rowY = doc.y;
        const rowH = 16;
        const bg = ri % 2 === 0 ? PDF_COLORS.tableBg : "#FFFFFF";
        row.forEach((cell, ci) => {
          doc.rect(56 + ci * colW, rowY, colW, rowH).fill(bg);
          doc
            .fillColor(PDF_COLORS.text)
            .fontSize(8)
            .font("Helvetica")
            .text(stripInline(cell), 59 + ci * colW, rowY + 3, { width: colW - 6, ellipsis: true });
        });
        doc.moveDown(0.1);
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
        }
      });

      doc.moveDown(0.8);
      tableRows = [];
      inTable = false;
    };

    for (const line of parsed) {
      if (doc.y > doc.page.height - 80) doc.addPage();

      if (line.type === "tableRow") {
        inTable = true;
        const cols = line.content.split("|").map((c) => c.trim()).filter(Boolean);
        tableRows.push(cols);
        continue;
      }
      if (line.type === "tableSep") continue;
      if (inTable) {
        flushTable();
      }

      switch (line.type) {
        case "h1":
          doc.moveDown(0.5);
          doc.fontSize(15).font("Helvetica-Bold").fillColor(PDF_COLORS.primary)
            .text(stripInline(line.content), 56, doc.y, { width: W });
          doc.rect(56, doc.y + 2, W, 1.5).fill(PDF_COLORS.primary);
          doc.moveDown(0.8);
          break;
        case "h2":
          doc.moveDown(0.5);
          doc.fontSize(12).font("Helvetica-Bold").fillColor(PDF_COLORS.text)
            .text(stripInline(line.content), 56, doc.y, { width: W });
          doc.rect(56, doc.y + 2, W, 0.75).fill(PDF_COLORS.ruleLine);
          doc.moveDown(0.5);
          break;
        case "h3":
          doc.moveDown(0.3);
          doc.fontSize(11).font("Helvetica-Bold").fillColor(PDF_COLORS.text)
            .text(stripInline(line.content), 56, doc.y, { width: W });
          doc.moveDown(0.4);
          break;
        case "h4":
          doc.moveDown(0.2);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(PDF_COLORS.muted)
            .text(stripInline(line.content), 56, doc.y, { width: W });
          doc.moveDown(0.3);
          break;
        case "bullet":
          doc.fontSize(10).font("Helvetica").fillColor(PDF_COLORS.text)
            .text("• " + stripInline(line.content), 68, doc.y, { width: W - 12 });
          break;
        case "numbered":
          doc.fontSize(10).font("Helvetica").fillColor(PDF_COLORS.text)
            .text(stripInline(line.content), 72, doc.y, { width: W - 16 });
          break;
        case "blockquote":
          doc.rect(56, doc.y, 3, 14).fill(PDF_COLORS.primary);
          doc.fontSize(10).font("Helvetica-Oblique").fillColor(PDF_COLORS.muted)
            .text(stripInline(line.content), 66, doc.y - 11, { width: W - 10 });
          doc.moveDown(0.3);
          break;
        case "codeBlock":
          doc.moveDown(0.2);
          const codeLines = line.content.split("\n");
          const codeH = codeLines.length * 12 + 10;
          doc.rect(56, doc.y, W, codeH).fill(PDF_COLORS.codeBg);
          doc.fontSize(8).font("Courier").fillColor(PDF_COLORS.codeText)
            .text(line.content, 62, doc.y - codeH + 5, { width: W - 12, lineGap: 2 });
          doc.moveDown(0.5);
          break;
        case "hr":
          doc.moveDown(0.3);
          doc.rect(56, doc.y, W, 0.75).fill(PDF_COLORS.ruleLine);
          doc.moveDown(0.5);
          break;
        case "blank":
          doc.moveDown(0.35);
          break;
        case "text":
          doc.fontSize(10).font("Helvetica").fillColor(PDF_COLORS.text)
            .text(stripInline(line.content), 56, doc.y, { width: W, lineGap: 2 });
          break;
      }
    }

    if (inTable) flushTable();

    // ── Footer on each page ──
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(PDF_COLORS.muted)
        .text(
          `AI Architect Intelligence  •  ${ts}  •  Page ${i + 1} of ${pageCount}`,
          56,
          doc.page.height - 36,
          { width: W, align: "center" }
        );
    }

    doc.end();
  });
}

// ── DOCX Export ────────────────────────────────────────────────────────────────

function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  for (const part of parts) {
    if (/^\*\*\*(.+)\*\*\*$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(3, -3), bold: true, italics: true }));
    } else if (/^\*\*(.+)\*\*$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (/^\*(.+)\*$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else if (/^`(.+)`$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: "Courier New", size: 18, color: "334155" }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs;
}

export async function toDocx(
  mdContent: string,
  title: string,
  requirements: string
): Promise<Buffer> {
  const ts = new Date().toLocaleString();
  const children: (Paragraph | Table)[] = [];

  // ── Title block ──
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 48, color: "2563EB" })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated: ${ts}  •  AI Architect Intelligence`, size: 16, color: "64748B" }),
      ],
      spacing: { after: 320 },
    })
  );

  // ── Requirements box ──
  if (requirements.trim()) {
    const reqText = requirements.slice(0, 400);
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "REQUIREMENTS", bold: true, size: 18, color: "2563EB" })],
        spacing: { before: 80, after: 60 },
        shading: { type: ShadingType.SOLID, color: "EFF6FF" },
        border: { left: { style: BorderStyle.THICK, size: 6, space: 8, color: "2563EB" } },
      }),
      new Paragraph({
        children: [new TextRun({ text: reqText + (requirements.length > 400 ? "…" : ""), size: 18, color: "64748B" })],
        spacing: { after: 320 },
        shading: { type: ShadingType.SOLID, color: "EFF6FF" },
        border: { left: { style: BorderStyle.THICK, size: 6, space: 8, color: "2563EB" } },
      })
    );
  }

  // ── Parse and render ──
  const parsed = parseMarkdown(mdContent);
  let tableRows: string[][] = [];
  let inTable = false;
  let listNum = 1;

  const flushTable = () => {
    if (!tableRows.length) return;
    const colCount = Math.max(...tableRows.map((r) => r.length));
    const colW = Math.floor(9000 / colCount);

    const rows = tableRows.map((row, ri) => {
      const isHeader = ri === 0;
      return new TableRow({
        tableHeader: isHeader,
        children: Array.from({ length: colCount }, (_, ci) => {
          const cellText = row[ci] ?? "";
          return new TableCell({
            width: { size: colW, type: WidthType.DXA },
            shading: isHeader
              ? { type: ShadingType.SOLID, color: "2563EB" }
              : ri % 2 === 0
              ? { type: ShadingType.SOLID, color: "EFF6FF" }
              : { type: ShadingType.CLEAR, color: "FFFFFF" },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: stripInline(cellText),
                    bold: isHeader,
                    color: isHeader ? "FFFFFF" : "1E293B",
                    size: 18,
                  }),
                ],
              }),
            ],
          });
        }),
      });
    });

    children.push(new Table({ rows, width: { size: 9000, type: WidthType.DXA } }));
    children.push(new Paragraph({ spacing: { after: 160 } }));
    tableRows = [];
    inTable = false;
  };

  for (const line of parsed) {
    if (line.type === "tableRow") {
      inTable = true;
      tableRows.push(line.content.split("|").map((c) => c.trim()).filter(Boolean));
      continue;
    }
    if (line.type === "tableSep") continue;
    if (inTable) flushTable();

    if (line.type !== "numbered") listNum = 1;

    switch (line.type) {
      case "h1":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: stripInline(line.content), bold: true, size: 36, color: "2563EB" })],
          spacing: { before: 360, after: 160 },
        }));
        break;
      case "h2":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: stripInline(line.content), bold: true, size: 28, color: "1E293B" })],
          spacing: { before: 280, after: 120 },
        }));
        break;
      case "h3":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: stripInline(line.content), bold: true, size: 24, color: "1E293B" })],
          spacing: { before: 200, after: 80 },
        }));
        break;
      case "h4":
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_4,
          children: [new TextRun({ text: stripInline(line.content), bold: true, size: 20, color: "64748B" })],
          spacing: { before: 160, after: 60 },
        }));
        break;
      case "bullet":
        children.push(new Paragraph({
          bullet: { level: 0 },
          children: inlineRuns(line.content),
          spacing: { after: 40 },
        }));
        break;
      case "numbered":
        children.push(new Paragraph({
          numbering: { reference: "default-numbering", level: 0 },
          children: inlineRuns(line.content),
          spacing: { after: 40 },
        }));
        listNum++;
        break;
      case "codeBlock":
        children.push(new Paragraph({
          children: [new TextRun({ text: line.content, font: "Courier New", size: 16, color: "334155" })],
          spacing: { before: 80, after: 80 },
          shading: { type: ShadingType.SOLID, color: "F8FAFC" },
          border: {
            left: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
            top: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
          },
        }));
        break;
      case "blockquote":
        children.push(new Paragraph({
          children: [new TextRun({ text: stripInline(line.content), italics: true, color: "64748B" })],
          spacing: { after: 80 },
          indent: { left: 360 },
          border: { left: { style: BorderStyle.THICK, size: 6, color: "2563EB", space: 8 } },
        }));
        break;
      case "hr":
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 4 } },
          spacing: { before: 120, after: 120 },
          children: [],
        }));
        break;
      case "blank":
        children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      case "text":
        children.push(new Paragraph({
          children: inlineRuns(line.content),
          spacing: { after: 80 },
        }));
        break;
    }
  }

  if (inTable) flushTable();

  const docx = new Document({
    creator: "AI Architect Intelligence",
    title,
    description: requirements.slice(0, 255),
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: "decimal" as const,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        children,
      },
    ],
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Calibri", size: 22, color: "1E293B" },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 36, color: "2563EB" },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 28, color: "1E293B" },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 24, color: "1E293B" },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
        {
          id: "Heading4",
          name: "Heading 4",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 20, color: "64748B" },
          paragraph: { spacing: { before: 160, after: 60 } },
        },
      ],
    },
  });

  return Packer.toBuffer(docx) as Promise<Buffer>;
}
