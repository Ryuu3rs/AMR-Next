import { createMadaraAdapter } from "./madara"

// MangaRead is a standard Madara site. All behaviour lives in the shared factory;
// this file is just its configuration row.
export const mangareadAdapter = createMadaraAdapter({
    id: "mangaread",
    name: "MangaRead",
    origin: "https://www.mangaread.org",
    domains: ["mangaread.org", "www.mangaread.org"]
})
