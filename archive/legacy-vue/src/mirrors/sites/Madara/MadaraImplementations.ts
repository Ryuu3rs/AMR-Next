import { MirrorHelper } from "../../MirrorHelper"
import { MirrorImplementation } from "../../../types/common"
import { Madara } from "./Madara"
import DragonTeaIcon from "../../icons/dragon-tea-optimized.png"
import GDScansIcon from "../../icons/gd-scans-optimized.png"
import HiperdexIcon from "../../icons/hiperdex-optimized.png"
import KunMangaIcon from "../../icons/kun-manga-optimized.png"
import LHTranslationsIcon from "../../icons/lhtranslations-optimized.png"
import MangaSushiIcon from "../../icons/mangasushi-optimized.png"
import ManhuaFastIcon from "../../icons/manhuafast-optimized.png"
import ManhuaPlusIcon from "../../icons/manhuaplus-optimized.png"
import ManhwaTopIcon from "../../icons/manhwa-top-optimized.png"
import ManhwaClubIcon from "../../icons/manhwaclub-optimized.png"
import ManhwaHentaiIcon from "../../icons/manhwahentai-optimized.png"
import ManytoonIcon from "../../icons/manytoon-optimized.png"
import RuyaMangaIcon from "../../icons/ruya-manga-optimized.png"
import S2MangaIcon from "../../icons/s2-manga-optimized.png"
import SetsuScansIcon from "../../icons/setsuscans-optimized.png"
import ToonilyIcon from "../../icons/toonily-optimized.png"
import WebtoonXyzIcon from "../../icons/webtoon-xyz-optimized.png"
import MangaClashIcon from "../../icons/manga-clash-optimized.png"
import MangaReadIcon from "../../icons/manga-read-optimized.png"
import ManhuausIcon from "../../icons/manhuaus-optimized.png"
import { ManyToon } from "./ManyToon"

/**
 * All implementations based of Madara are placed here
 * avoids the need to create new file for each implementation
 *
 * @NOTE: home or search_url option must end in "/"
 */
export const getMadaraImplementations = (mirrorHelper: MirrorHelper): MirrorImplementation[] => {
    return [
        new Madara(mirrorHelper, {
            mirrorName: "Webtoon.xyz",
            mirrorIcon: WebtoonXyzIcon,
            languages: "en",
            domains: ["webtoon.xyz"],
            home: "https://www.webtoon.xyz/",
            chapter_url: /^\/read\/.*\/.+$/g,
            disabledForSearch: true // 403 Forbidden - Cloudflare blocking
        }),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Toonily",
                mirrorIcon: ToonilyIcon,
                languages: "en",
                domains: ["toonily.com"],
                home: "https://toonily.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                disabled: true // Site uses JavaScript-based lazy loading - image URLs not in static HTML
            },
            {
                img_src: "data-src",
                secondary_img_src: "src"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "ManhwaHentai",
                mirrorIcon: ManhwaHentaiIcon,
                languages: "en",
                domains: ["manhwahentai.me"],
                home: "https://manhwahentai.me/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://manhwahentai.me/",
                img_src: "src",
                secondary_img_src: "data-src",
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Dragon Tea",
                mirrorIcon: DragonTeaIcon,
                languages: "en",
                domains: ["dragontea.ink"],
                home: "https://dragontea.ink/",
                canListFullMangas: false,
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://www.dragontea.ink/",
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "GD Scans",
                mirrorIcon: GDScansIcon,
                languages: "en",
                domains: ["gdstmp.site", "gdscans.com"],
                home: "https://www.gdscans.com/",
                canListFullMangas: false,
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g
            },
            {
                search_url: "https://www.gdscans.com/",
                chapter_list_ajax: true,
                isekai_chapter_url: true // Use modern /ajax/chapters/ endpoint
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Hiperdex",
                mirrorIcon: HiperdexIcon,
                languages: "en",
                domains: ["hiperdex.com", "hiperdex.top"],
                home: "https://www.hiperdex.top/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                disabledForSearch: true // Domain appears offline
            },
            {
                search_url: "https://www.hiperdex.top/",
                search_json: true,
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Kun Manga",
                mirrorIcon: KunMangaIcon,
                languages: "en",
                domains: ["kunmanga.com"],
                home: "https://kunmanga.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://kunmanga.com/"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "LHTranslations",
                mirrorIcon: LHTranslationsIcon,
                languages: "en",
                domains: ["lhtranslation.net"],
                home: "https://lhtranslation.net",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: true
            },
            {
                search_url: "https://lhtranslation.net/",
                chapter_list_ajax: true,
                isekai_chapter_url: true,
                chapters_a_sel: `li.wp-manga-chapter > a[href*="lhtranslation.net"]`
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Manga Clash",
                mirrorIcon: MangaClashIcon,
                languages: "en",
                domains: ["mangaclash.com", "toonclash.com"],
                home: "https://toonclash.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series|devmax)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://toonclash.com/"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Manga Read",
                mirrorIcon: MangaReadIcon,
                languages: "en",
                domains: ["mangaread.org"],
                home: "https://www.mangaread.org/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series|read)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://www.mangaread.org/"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Manga Sushi",
                mirrorIcon: MangaSushiIcon,
                languages: "en",
                domains: ["mangasushi.net", "mangasushi.org"],
                home: "https://mangasushi.org/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://mangasushi.org/",
                secondary_img_src: "data-src",
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "ManhuaFast",
                mirrorIcon: ManhuaFastIcon,
                languages: "en",
                domains: ["manhuafast.com"],
                home: "https://manhuafast.com/",
                chapter_url: /\/manga\/.+\/chapter-.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://manhuafast.com/",
                img_src: "src",
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "ManhuaPlus",
                mirrorIcon: ManhuaPlusIcon,
                languages: "en",
                domains: ["manhuaplus.com"],
                home: "https://manhuaplus.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://manhuaplus.com/",
                search_a_sel: "div.post-title > h3 > a",
                chapter_list_ajax: true,
                isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "ManhwaClub",
                mirrorIcon: ManhwaClubIcon,
                languages: "en",
                domains: ["manhwa.club"],
                home: "https://manhwa.club/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://manhwa.club/",
                secondary_img_src: "data-src"
            }
        ),
        // There are additional net request rules for manhwatop.com.
        // If you are updating this mirror, don't forget to also update MirrorNetRequestRules.ts file.
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Manhwa Top",
                mirrorIcon: ManhwaTopIcon,
                languages: "en",
                domains: ["manhwatop.com"],
                home: "https://manhwatop.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series|read)\/.*\/.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // Search endpoint currently returns HTTP errors
            },
            {
                search_url: "https://manhwatop.com/",
                chapter_list_ajax: true,
                isekai_chapter_url: true, // Use modern /ajax/chapters/ endpoint
                img_src: "data-src"
            }
        ),
        new ManyToon(
            mirrorHelper,
            {
                mirrorName: "Manytoon",
                mirrorIcon: ManytoonIcon,
                languages: "en",
                domains: ["manytoon.com"],
                home: "https://manytoon.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // 400 Bad Request
            },
            {
                search_url: "https://manytoon.com/",
                img_src: "src"
                // chapter_list_ajax: true,
                // isekai_chapter_url: true
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Ruya Manga",
                mirrorIcon: RuyaMangaIcon,
                languages: "en",
                domains: ["en.ruyamanga.com"],
                home: "https://en.ruyamanga.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // Domain appears offline
            },
            {
                search_url: "https://en.ruyamanga.com/"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "S2 Manga",
                mirrorIcon: S2MangaIcon,
                languages: "en",
                domains: ["s2manga.com"],
                home: "https://s2manga.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                search_url: "https://s2manga.com/"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Setsu Scans",
                mirrorIcon: SetsuScansIcon,
                languages: "en",
                domains: ["setsuscans.com"],
                home: "https://setsuscans.com/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://setsuscans.com/",
                chapter_list_ajax: true,
                isekai_chapter_url: true,
                chapter_list_ajax_selctor_type: "html",
                chapter_list_ajax_selctor: "#manga-chapters-holder"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Manhuaus",
                mirrorIcon: ManhuausIcon,
                languages: "en",
                domains: ["manhuaus.com"],
                home: "https://manhuaus.com/",
                chapter_url: /\/manga\/.+\/chapter\-.+$/g,
                canListFullMangas: false,
                disabledForSearch: true // 403 Forbidden - Cloudflare blocking
            },
            {
                search_url: "https://manhuaus.com/",
                img_src: "src",
                chapter_list_ajax: true,
                isekai_chapter_url: true,
                secondary_img_src: "data-src"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "Fire Scans",
                mirrorIcon: require("../../icons/hari-manga-optimized.png"),
                languages: "en",
                domains: ["firescans.xyz"],
                home: "https://firescans.xyz/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                chapter_list_ajax: true,
                isekai_chapter_url: true,
                chapter_list_ajax_selctor_type: "html",
                chapter_list_ajax_selctor: "#manga-chapters-holder"
            }
        ),
        new Madara(
            mirrorHelper,
            {
                mirrorName: "UToon",
                mirrorIcon: require("../../icons/utoon-optimized.png"),
                languages: "en",
                domains: ["utoon.net"],
                home: "https://utoon.net/",
                chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
                canListFullMangas: false
            },
            {
                chapter_list_ajax: true,
                isekai_chapter_url: true
                // Use default chapters_a_sel: "li.wp-manga-chapter > a" which matches all chapters
            }
        )
        // new Madara(
        //     mirrorHelper,
        //     {
        //         mirrorName: "Toon God",
        //         mirrorIcon: require("../../icons/toon-god-optimized.png"),
        //         languages: "en",
        //         domains: ["toongod.org"],
        //         home: "https://www.toongod.org/home/",
        //         chapter_url: /^\/(manhwa|comic|manga|webtoon|manhua|series)\/.*\/.+$/g,
        //         canListFullMangas: false
        //     },
        //     {
        //         // chapter_list_ajax: true,
        //         // isekai_chapter_url: true,
        //         // chapters_a_sel: "li.wp-manga-chapter a:contains('Chapter')"
        //         // chapter_list_ajax_selctor_type: "html",
        //         // chapter_list_ajax_selctor: "#manga-chapters-holder"
        //     }
        // )
    ]
}
