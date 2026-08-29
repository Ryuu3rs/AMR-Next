// Single source of truth for the consent-card copy and the in-app privacy policy shown in
// Settings -> Privacy & Community. Kept as data (not inline JSX) so the exact same wording is
// reused by the first-run card, the Settings re-read, and the hosted policy, and so the
// consent version below stays lockstep with CONSENT_VERSION in community.ts + the server.

// The short bullet list shown on the consent card and at the top of the Settings section.
export const DATA_COLLECTED: readonly string[] = [
    "A random install id (anonymous - not your name, email, or IP)",
    "A username you choose",
    "Which chapters you read: title, source site, genres, and date",
    "The ratings and votes you give titles"
]

export const DATA_NOT_COLLECTED: readonly string[] = [
    "The content of the pages you view",
    "Your browsing history outside AMR",
    "Your real name, email, or location",
    "Any payment information"
]

// One-line summary for the consent card body.
export const CONSENT_SUMMARY =
    "AMR can send anonymous usage and a username you choose to the AMR community server to " +
    "power install counts, leaderboards, and recommendations. We never sell your data, and " +
    "you can turn this off anytime in Settings."

// What the "Disable" choice means, shown under that button so declining is a fully informed,
// low-pressure choice (keeps consent freely given).
export const DECLINE_EXPLAINER =
    "AMR keeps working exactly the same - you just won't see community features like " +
    "leaderboards and recommendations. You can turn it on anytime in Settings."

// The full policy text, rendered as sections in Settings -> Privacy & Community and mirrored
// by the hosted copy at the URL below. Update POLICY_VERSION + CONSENT_VERSION together on any
// material change so users are re-prompted.
export const POLICY_VERSION = 1
export const POLICY_URL = "https://privacy.weeb.ltd"
export const POLICY_CONTACT = "privacy@weeb.ltd"

export type PolicySection = { heading: string; body: string[] }

export const PRIVACY_POLICY: readonly PolicySection[] = [
    {
        heading: "AMR-Next Privacy & Data Policy",
        body: [
            "AMR-Next is a browser extension for reading and tracking manga. It works fully " +
                "without any account, sign-in, or server connection. Community features are " +
                "optional and off until you turn them on."
        ]
    },
    {
        heading: "What we collect (only if you enable community features)",
        body: DATA_COLLECTED.map(d => `- ${d}`)
    },
    {
        heading: "What we never collect",
        body: DATA_NOT_COLLECTED.map(d => `- ${d}`)
    },
    {
        heading: "Why we collect it",
        body: [
            "To count how many people use AMR across Chrome and Firefox, and to power " +
                "community features: leaderboards, a community vote, and 'readers also read' " +
                "recommendations based on titles people with similar libraries enjoy. That is " +
                "all - we do not build advertising profiles."
        ]
    },
    {
        heading: "We never sell your data",
        body: [
            "We do not sell, rent, or share your data with advertisers or any third party. It " +
                "is used only to run the features above."
        ]
    },
    {
        heading: "Your choices and rights",
        body: [
            "- Community features are off until you tap Accept.",
            "- You can turn them off at any time here in Settings. Turning them off stops all " +
                "collection immediately.",
            "- You can delete your community data (username, votes, reading events) at any time " +
                "with the 'Delete my community data' button below.",
            "- In the EU/UK you have the right to access, correct, or erase your data and to " +
                "withdraw consent - the controls here let you do this directly."
        ]
    },
    {
        heading: "Where your data is stored",
        body: [
            "Community data is stored on our own server, hosted in Germany (EU). It is not " +
                "shared with other services."
        ]
    },
    {
        heading: "Retention",
        body: [
            "We keep community data only while you have community features enabled. Deleting " +
                "your data removes it from our server."
        ]
    },
    {
        heading: "Children",
        body: [
            "AMR-Next is not directed at children under 16. If you are under 16, please do not " +
                "enable community features."
        ]
    },
    {
        heading: "Contact",
        body: [`Questions or a data request: ${POLICY_CONTACT}.`]
    },
    {
        heading: "Changes",
        body: [
            "If we materially change this policy, the app will ask you to review and accept the " +
                "new version before continuing to send data."
        ]
    }
]
