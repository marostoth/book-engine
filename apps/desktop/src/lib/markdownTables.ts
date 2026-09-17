/**
 * A GitHub table leaves out each cell that a row has beyond the cells of its header row. The PDF import can end the
 * last row of a table with the text that follows the table in the book, after the last `|`, so those words did not
 * show (RD-03). For a block that starts with a table, such text leaves the row and shows as a paragraph below the
 * table (`textAfter`), and any other cell beyond the header joins the last cell of its row.
 */
export function withEveryTableWord(markdown: string): { table: string; textAfter: string } {
  if (!markdown.includes("|")) return { table: markdown, textAfter: "" };
  const lines = markdown.split("\n");
  const columns = lines.length > 2 && lines[0].includes("|") ? tableCells(lines[0]).length : 0;
  if (!columns || delimiterColumns(lines[1]) !== columns) return { table: markdown, textAfter: "" };

  let textAfter = "";
  const last = lines.length - 1;
  const lastRow = lines[last].trim();
  if (lastRow.startsWith("|") && !lastRow.endsWith("|") && tableCells(lastRow).length > columns) {
    const cells = tableCells(lastRow);
    textAfter = cells[cells.length - 1].trim();
    lines[last] = lastRow.slice(0, lastRow.length - cells[cells.length - 1].length);
  }
  for (let index = 2; index < lines.length; index++) {
    const cells = tableCells(lines[index].trim());
    if (cells.length > columns) {
      const joined = cells.slice(columns - 1).map((cell) => cell.trim()).filter(Boolean).join(" ");
      lines[index] = `|${[...cells.slice(0, columns - 1), joined].join("|")}|`;
    }
  }
  return { table: lines.join("\n"), textAfter };
}

/** The cells of a table row as markdown-it splits it: at each `|` after no backslash, with no empty edge cell. */
function tableCells(row: string): string[] {
  const cells = row.trim().split(/(?<!\\)\|/);
  if (cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/** The number of columns of a delimiter row such as `|:---|---:|`, or 0 when the line is no delimiter row. */
function delimiterColumns(line: string): number {
  const cells = line.trim().split("|").map((cell) => cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells.length && cells.every((cell) => /^:?-+:?$/.test(cell)) ? cells.length : 0;
}
