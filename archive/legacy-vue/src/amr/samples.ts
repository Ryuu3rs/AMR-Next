/**
 * Sample mangas imported when list is empty on user action
 */

/** Sample manga entry */
export interface SampleManga {
    mirror: string
    name: string
    url: string
}

const samples: SampleManga[] = [
    {
        mirror: "Manga-Fox",
        name: "One Piece",
        url: "https://fanfox.net/manga/one_piece/"
    },
    {
        mirror: "Manga-Fox",
        name: "Naruto",
        url: "https://fanfox.net/manga/naruto/"
    },
    {
        mirror: "Manga-Fox",
        name: "Bleach",
        url: "https://fanfox.net/manga/bleach/"
    },
    {
        mirror: "Manga Katana",
        name: "Dragon Ball Super",
        url: "https://mangakatana.com/manga/dragon-ball-super.2080"
    }
]

export default samples
