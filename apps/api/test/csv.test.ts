import { describe, expect, it } from "vitest";
import { csvCell, csvRows } from "../src/common/csv";

describe("CSV seguro", () => {
  it("neutraliza fórmulas em células controladas pelo usuário", () => {
    expect(csvCell('=HYPERLINK("http://malicioso","clique")')).toBe(
      '"\'=HYPERLINK(""http://malicioso"",""clique"")"',
    );
    expect(csvCell("+1+1")).toBe("\"'+1+1\"");
    expect(csvCell("-1+1")).toBe("\"'-1+1\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
  });

  it("mantém texto comum e escapa aspas", () => {
    expect(csvCell("Kennedy Matos")).toBe('"Kennedy Matos"');
    expect(csvCell('nome "teste"')).toBe('"nome ""teste"""');
  });

  it("monta o CSV com cabeçalho e linhas", () => {
    expect(csvRows(["nome"], [["=1+1"]])).toBe('"nome"\n"\'=1+1"');
  });
});
