import Database from "better-sqlite3"
import { join } from "node:path"

const DATA_DIR = process.env.DATA_DIR ?? "./data"
const db = new Database(join(DATA_DIR, "community.db"))
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id   TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS events (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_id  TEXT NOT NULL,
        manga_title TEXT NOT NULL,
        genres     TEXT NOT NULL DEFAULT '[]',
        date       TEXT NOT NULL,
        synced_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup
        ON events(user_id, manga_title, date, source_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);

    CREATE TABLE IF NOT EXISTS user_achievements (
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_id TEXT NOT NULL,
        unlocked_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (user_id, achievement_id)
    );
`)

function weekBounds(): [string, string] {
    const now = new Date()
    const day = now.getUTCDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    const mon = new Date(now)
    mon.setUTCDate(now.getUTCDate() + diffToMonday)
    const sun = new Date(mon)
    sun.setUTCDate(mon.getUTCDate() + 6)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return [fmt(mon), fmt(sun)]
}

export function createUser(id: string, username: string): void {
    db.prepare("INSERT INTO users (id, username) VALUES (?, ?)").run(id, username)
}

export function getUserByUsername(username: string): { id: string; username: string } | undefined {
    return db.prepare("SELECT id, username FROM users WHERE username = ? COLLATE NOCASE").get(username) as
        | { id: string; username: string }
        | undefined
}

export function getUserById(id: string): { id: string; username: string } | undefined {
    return db.prepare("SELECT id, username FROM users WHERE id = ?").get(id) as
        | { id: string; username: string }
        | undefined
}

export type EventRow = {
    id: string
    sourceId: string
    mangaTitle: string
    genres: string[]
    date: string
}

const _insertEvent = db.prepare(
    "INSERT OR IGNORE INTO events (id, user_id, source_id, manga_title, genres, date) VALUES (?, ?, ?, ?, ?, ?)"
)

export const insertEvents = db.transaction((userId: string, rows: EventRow[]) => {
    for (const e of rows) {
        _insertEvent.run(e.id, userId, e.sourceId, e.mangaTitle, JSON.stringify(e.genres), e.date)
    }
})

export function getUserChapterCount(userId: string): number {
    return (db.prepare("SELECT COUNT(*) as n FROM events WHERE user_id = ?").get(userId) as { n: number }).n
}

export function getUserSourceCount(userId: string): number {
    return (
        db.prepare("SELECT COUNT(DISTINCT source_id) as n FROM events WHERE user_id = ?").get(userId) as { n: number }
    ).n
}

export function getStoredAchievements(userId: string): string[] {
    return (
        db.prepare("SELECT achievement_id FROM user_achievements WHERE user_id = ?").all(userId) as Array<{
            achievement_id: string
        }>
    ).map(r => r.achievement_id)
}

const _insertAchievement = db.prepare("INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)")

export function storeAchievements(userId: string, ids: string[]): void {
    for (const id of ids) _insertAchievement.run(userId, id)
}

export function getUserRank(userId: string): number | null {
    const [start, end] = weekBounds()
    const row = db
        .prepare(
            `WITH weekly AS (
                SELECT user_id, COUNT(*) as n FROM events
                WHERE date >= ? AND date <= ? GROUP BY user_id
            ),
            ranked AS (
                SELECT user_id, RANK() OVER (ORDER BY n DESC) as rank FROM weekly
            )
            SELECT rank FROM ranked WHERE user_id = ?`
        )
        .get(start, end, userId) as { rank: number } | undefined
    return row?.rank ?? null
}

export function getRecommendations(userId: string): Array<{ title: string; sourceId: string }> {
    return db
        .prepare(
            `WITH user_genres AS (
                SELECT value as genre, COUNT(*) as cnt
                FROM events, json_each(genres)
                WHERE user_id = ? GROUP BY genre ORDER BY cnt DESC LIMIT 3
            ),
            user_titles AS (
                SELECT DISTINCT manga_title FROM events WHERE user_id = ?
            )
            SELECT e.manga_title as title, e.source_id as sourceId, COUNT(DISTINCT e.user_id) as cnt
            FROM events e
            WHERE e.user_id != ?
                AND e.manga_title NOT IN (SELECT manga_title FROM user_titles)
                AND EXISTS (
                    SELECT 1 FROM json_each(e.genres) g
                    JOIN user_genres ug ON g.value = ug.genre
                )
            GROUP BY e.manga_title ORDER BY cnt DESC LIMIT 5`
        )
        .all(userId, userId, userId) as Array<{ title: string; sourceId: string }>
}

export function getCommunityStats(): {
    leaderboard: Array<{ rank: number; username: string; chaptersWeek: number }>
    trendingManga: Array<{ title: string; sourceId: string; count: number }>
    topGenres: Array<{ genre: string; count: number }>
    totalUsers: number
} {
    const [start, end] = weekBounds()

    const leaderboard = db
        .prepare(
            `SELECT u.username, COUNT(*) as chaptersWeek,
                RANK() OVER (ORDER BY COUNT(*) DESC) as rank
            FROM events e JOIN users u ON e.user_id = u.id
            WHERE e.date >= ? AND e.date <= ?
            GROUP BY e.user_id ORDER BY chaptersWeek DESC LIMIT 10`
        )
        .all(start, end) as Array<{ rank: number; username: string; chaptersWeek: number }>

    const trendingManga = db
        .prepare(
            `SELECT manga_title as title, source_id as sourceId, COUNT(DISTINCT user_id) as count
            FROM events WHERE date >= ? AND date <= ?
            GROUP BY manga_title ORDER BY count DESC LIMIT 5`
        )
        .all(start, end) as Array<{ title: string; sourceId: string; count: number }>

    const topGenres = db
        .prepare(
            `SELECT value as genre, COUNT(*) as count
            FROM events, json_each(genres)
            WHERE date >= ? AND date <= ?
            GROUP BY genre ORDER BY count DESC LIMIT 10`
        )
        .all(start, end) as Array<{ genre: string; count: number }>

    const totalUsers = (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n

    return { leaderboard, trendingManga, topGenres, totalUsers }
}
