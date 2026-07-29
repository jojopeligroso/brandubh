import { describe, expect, it } from "vitest";
import { toSeanchlo, toSeanchloTable } from "./seimhiu";

describe("toSeanchlo — séimhiú overdots", () => {
  it("dots every lenitable consonant + h", () => {
    expect(toSeanchlo("bhí")).toBe("ḃí");
    expect(toSeanchlo("chaith")).toBe("ċaiṫ");
    expect(toSeanchlo("dhún")).toBe("ḋún");
    expect(toSeanchlo("fhear")).toBe("ḟear");
    expect(toSeanchlo("ghaoth")).toBe("ġaoṫ");
    expect(toSeanchlo("mhór")).toBe("ṁór");
    expect(toSeanchlo("pholl")).toBe("ṗoll");
    expect(toSeanchlo("shúil")).toBe("ṡúil");
    expect(toSeanchlo("thart")).toBe("ṫart");
  });

  it("dots word-internal lenition too", () => {
    expect(toSeanchlo("athair")).toBe("aṫair");
    expect(toSeanchlo("Lochlannach")).toBe("Loċlannaċ");
  });

  it("preserves case (title case and all caps)", () => {
    expect(toSeanchlo("Mhór")).toBe("Ṁór");
    expect(toSeanchlo("Chaith")).toBe("Ċaiṫ");
    expect(toSeanchlo("BHÍ")).toBe("ḂÍ");
  });
});

describe("toSeanchlo — eclipsis (urú) is not lenition", () => {
  it("writes eclipsed f as b + dotted f, never ḃf", () => {
    // Real strings from the Irish (ga) locale.
    expect(toSeanchlo("bhfear")).toBe("bḟear");
    expect(toSeanchlo("bhfoghlaithe")).toBe("bḟoġlaiṫe");
    // Capitalised root after the eclipsing b (e.g. "i bhFeidhm").
    expect(toSeanchlo("bhFeidhm")).toBe("bḞeiḋm");
  });

  it("leaves the h-less eclipsis pairs untouched", () => {
    // mb, gc, nd, bp, dt, ng have no "h" — nothing to dot.
    expect(toSeanchlo("i mbád")).toBe("i mbád");
    expect(toSeanchlo("gcluiche")).toBe("gcluiċe");
    expect(toSeanchlo("dtír")).toBe("dtír");
  });
});

describe("toSeanchlo — leaves non-lenition h alone", () => {
  it("keeps prothetic/independent h (h before a vowel)", () => {
    expect(toSeanchlo("na hÉireann")).toBe("na hÉireann");
    expect(toSeanchlo("go hiontach")).toBe("go hiontaċ");
    expect(toSeanchlo("hnefatafl")).toBe("hnefatafl");
  });

  it("is idempotent on its own output", () => {
    const once = toSeanchlo("chaith an mhór");
    expect(toSeanchlo(once)).toBe(once);
  });
});

describe("toSeanchloTable — deep conversion of a translations table", () => {
  it("converts every string, including nested Record fields", () => {
    const table = {
      subtitle: "Hnefatafl Gaelach",
      matchSet: "Sraith",
      variantNames: { walker: "Brandubh · Walker" },
    };
    expect(toSeanchloTable(table)).toEqual({
      subtitle: "Hnefatafl Gaelaċ",
      matchSet: "Sraiṫ",
      variantNames: { walker: "Branduḃ · Walker" },
    });
  });

  it("does not mutate the input", () => {
    const table = { a: "chaith" };
    toSeanchloTable(table);
    expect(table.a).toBe("chaith");
  });
});
