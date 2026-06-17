export function isNewerVersion(candidate: string, current: string): boolean {
    const parts = (v: string) => v.split(".").map(n => parseInt(n, 10) || 0)
    const [cMaj = 0, cMin = 0, cPatch = 0] = parts(candidate)
    const [uMaj = 0, uMin = 0, uPatch = 0] = parts(current)
    if (cMaj !== uMaj) return cMaj > uMaj
    if (cMin !== uMin) return cMin > uMin
    return cPatch > uPatch
}
