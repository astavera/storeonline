import { describe, expect, it } from "vitest";
import type { WebsiteMerchandisingConfig } from "@/features/catalog/services/website-merchandising-service";
import { mergeWebsiteMerchandisingProductSubset, parseWebsiteMerchandising } from "@/server/admin/website-merchandising-store";

describe("website merchandising store", () => {
  it("upgrades saved placements created before age groups were added", () => {
    const config = parseWebsiteMerchandising({
      version: 1,
      updatedAt: "2026-07-13T15:00:00.000Z",
      categories: [
        {
          id: "category-toys",
          name: "Toys",
          slug: "toys",
          description: "Customer-friendly toys.",
          visible: true,
          sortOrder: 0
        }
      ],
      placements: [
        {
          squareVariationId: "variation-1",
          categoryIds: ["category-toys"],
          visible: true,
          sortOrder: 0
        }
      ]
    });

    expect(config).toMatchObject({ version: 3, categories: [expect.objectContaining({ id: "category-toys", name: "Toys", parentId: null })], brands: [], holidays: [] });
    expect(config?.placements[0]).toMatchObject({ brandIds: [], ageGroups: [], fulfillmentModes: [], surfaceIds: [], holidayAssignments: [], visible: false });
  });

  it("rejects unsupported age values", () => {
    expect(
      parseWebsiteMerchandising({
        version: 1,
        updatedAt: "2026-07-13T15:00:00.000Z",
        categories: [],
        placements: [{ squareVariationId: "variation-1", categoryIds: [], ageGroups: ["adult-only"], visible: true, sortOrder: 0 }]
      })
    ).toBeNull();
  });

  it("rejects placements that reference website structures that do not exist", () => {
    expect(
      parseWebsiteMerchandising({
        version: 3,
        updatedAt: "2026-07-13T15:00:00.000Z",
        categories: [],
        brands: [],
        holidays: [],
        placements: [
          {
            squareVariationId: "variation-1",
            categoryIds: ["missing-category"],
            brandIds: [],
            holidayAssignments: [],
            ageGroups: [],
            fulfillmentModes: ["pickup"],
            surfaceIds: ["shop"],
            visible: false,
            sortOrder: 0
          }
        ]
      })
    ).toBeNull();
  });

  it("accepts four category levels and rejects a fifth level", () => {
    const category = (id: string, parentId: string | null) => ({ id, name: id, slug: id, description: "", parentId, visible: true, sortOrder: 0 });
    const base = { version: 3, updatedAt: "2026-07-13T15:00:00.000Z", brands: [], holidays: [], placements: [] };
    const fourLevels = [
      category("toys", null),
      category("games", "toys"),
      category("board-games", "games"),
      category("strategy-games", "board-games")
    ];

    expect(parseWebsiteMerchandising({ ...base, categories: fourLevels })?.categories).toHaveLength(4);
    expect(parseWebsiteMerchandising({ ...base, categories: [...fourLevels, category("cooperative-games", "strategy-games")] })).toBeNull();
  });

  it("rejects circular category relationships", () => {
    const category = (id: string, parentId: string | null) => ({ id, name: id, slug: id, description: "", parentId, visible: true, sortOrder: 0 });
    const base = { version: 3, updatedAt: "2026-07-13T15:00:00.000Z", brands: [], holidays: [], placements: [] };

    expect(parseWebsiteMerchandising({ ...base, categories: [category("games", "puzzles"), category("puzzles", "games")] })).toBeNull();
  });

  it("keeps product holiday dates inside the campaign window", () => {
    expect(
      parseWebsiteMerchandising({
        version: 3,
        updatedAt: "2026-07-13T15:00:00.000Z",
        categories: [],
        brands: [],
        holidays: [
          {
            id: "holiday-halloween",
            name: "Halloween",
            slug: "halloween",
            description: "Halloween campaign.",
            startDate: "2026-10-01",
            endDate: "2026-10-31",
            visible: true,
            sortOrder: 0
          }
        ],
        placements: [
          {
            squareVariationId: "variation-1",
            categoryIds: [],
            brandIds: [],
            holidayAssignments: [{ holidayId: "holiday-halloween", startsAt: "2026-09-30", endsAt: "2026-10-31" }],
            ageGroups: [],
            fulfillmentModes: ["pickup"],
            surfaceIds: ["holiday-pages"],
            visible: false,
            sortOrder: 0
          }
        ]
      })
    ).toBeNull();
  });

  it("preserves full-catalog placements when the preview subset is saved", () => {
    const existing = config([
      placement("full-catalog-variation", ["category-toys"]),
      placement("preview-variation", [])
    ]);
    const previewSubset = config([placement("preview-variation", ["category-toys"])]);
    const merged = mergeWebsiteMerchandisingProductSubset(existing, previewSubset, ["preview-variation"]);

    expect(merged.placements).toEqual([
      expect.objectContaining({ squareVariationId: "full-catalog-variation", categoryIds: ["category-toys"] }),
      expect.objectContaining({ squareVariationId: "preview-variation", categoryIds: ["category-toys"] })
    ]);
  });
});

function config(placements: WebsiteMerchandisingConfig["placements"]): WebsiteMerchandisingConfig {
  return {
    version: 3,
    updatedAt: "2026-07-13T15:00:00.000Z",
    categories: [{ id: "category-toys", name: "Toys", slug: "toys", description: "Website toys.", parentId: null, visible: true, sortOrder: 0 }],
    brands: [],
    holidays: [],
    placements
  };
}

function placement(squareVariationId: string, categoryIds: string[]): WebsiteMerchandisingConfig["placements"][number] {
  return {
    squareVariationId,
    categoryIds,
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder: 0
  };
}
