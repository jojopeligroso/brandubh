import { describe, expect, it } from "vitest";
import { GAELIC_LANGS, isGaelicLang, toSeanchlo, toSeanchloTable } from "./gaelic";

describe("isGaelicLang — the cló face applies only to Gaelic languages", () => {
  it("is true for Irish and Scottish Gaelic", () => {
    expect(isGaelicLang("ga")).toBe(true);
    expect(isGaelicLang("gd")).toBe(true);
    expect(GAELIC_LANGS.has("ga")).toBe(true);
  });

  it("is false for every other language", () => {
    expect(isGaelicLang("en")).toBe(false);
    expect(isGaelicLang("es")).toBe(false);
    expect(isGaelicLang("de")).toBe(false);
    expect(isGaelicLang("")).toBe(false);
  });
});

describe("toSeanchlo — séimhiú overdots", () => {
  it("dots every lenitable consonant + h", () => {
    expect(toSeanchlo("bhí")).toBe("ḃí");
    expect(toSeanchlo("chaith")).toBe("ċaiṫ");
    expect(toSeanchlo("mhór")).toBe("ṁór");
    expect(toSeanchlo("shúil")).toBe("ṡúil");
    expect(toSeanchlo("thart")).toBe("ṫart");
  });

  it("derives the Brandubh wordmark", () => {
    expect(toSeanchlo("Brand")).toBe("Brand");
    expect(toSeanchlo("ubh")).toBe("uḃ");
    expect(toSeanchlo("Brandubh")).toBe("Branduḃ");
  });

  it("preserves case", () => {
    expect(toSeanchlo("Mhór")).toBe("Ṁór");
    expect(toSeanchlo("BHÍ")).toBe("ḂÍ");
  });
});

describe("toSeanchlo — eclipsis (urú) is not lenition", () => {
  it("writes eclipsed f as b + dotted f, never ḃf", () => {
    expect(toSeanchlo("bhfear")).toBe("bḟear");
    expect(toSeanchlo("bhfoghlaithe")).toBe("bḟoġlaiṫe");
  });

  it("leaves h-less eclipsis pairs and prothetic h alone", () => {
    expect(toSeanchlo("i mbád")).toBe("i mbád");
    expect(toSeanchlo("na hÉireann")).toBe("na hÉireann");
  });
});

describe("toSeanchloTable — deep conversion for a Gaelic locale", () => {
  it("converts every string, including nested Record fields, without mutating", () => {
    const table = { subtitle: "Sraith", variantNames: { w: "Brandubh · Walker" } };
    expect(toSeanchloTable(table)).toEqual({
      subtitle: "Sraiṫ",
      variantNames: { w: "Branduḃ · Walker" },
    });
    expect(table.subtitle).toBe("Sraith");
  });
});
