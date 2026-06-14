<template>
    <v-container fluid class="achievements-container">
        <!-- Progress Overview -->
        <v-row class="mb-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-text class="d-flex align-center justify-space-between">
                        <div>
                            <div class="text-h5 font-weight-bold">{{ totalUnlocked }} / {{ totalAchievements }}</div>
                            <div class="text-subtitle-2 text-grey">Achievements Unlocked</div>
                        </div>
                        <v-progress-circular :model-value="completionPercentage" :size="80" :width="8" color="primary">
                            {{ completionPercentage }}%
                        </v-progress-circular>
                        <v-btn variant="outlined" size="small" color="primary" @click="exportAchievements">
                            <v-icon start>mdi-download</v-icon>Export
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Achievement Categories -->
        <v-row v-for="(achievements, category) in achievementsByCategory" :key="category" class="mb-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title class="d-flex align-center">
                        <v-icon start :color="getCategoryColor(category)">{{ getCategoryIcon(category) }}</v-icon>
                        {{ formatCategory(category) }}
                        <v-chip size="small" class="ml-2" :color="getCategoryColor(category)" variant="tonal">
                            {{ getUnlockedInCategory(achievements) }} / {{ achievements.length }}
                        </v-chip>
                    </v-card-title>
                    <v-card-text>
                        <v-row>
                            <v-col
                                v-for="achievement in achievements"
                                :key="achievement.id"
                                cols="12"
                                sm="6"
                                md="4"
                                lg="3">
                                <v-card
                                    :class="['achievement-card', isUnlocked(achievement.id) ? 'unlocked' : 'locked']"
                                    :elevation="isUnlocked(achievement.id) ? 3 : 1"
                                    @click="showDetails(achievement)">
                                    <v-card-text class="text-center pa-3">
                                        <v-avatar
                                            :size="56"
                                            :color="
                                                isUnlocked(achievement.id)
                                                    ? getCategoryColor(category)
                                                    : 'grey-lighten-2'
                                            ">
                                            <v-icon :size="32" :color="isUnlocked(achievement.id) ? 'white' : 'grey'">{{
                                                achievement.icon
                                            }}</v-icon>
                                        </v-avatar>
                                        <div class="text-subtitle-1 font-weight-bold mt-2">{{ achievement.name }}</div>
                                        <div class="text-caption text-grey">{{ achievement.description }}</div>
                                        <v-progress-linear
                                            v-if="!isUnlocked(achievement.id)"
                                            :model-value="getProgressPercent(achievement)"
                                            :color="getCategoryColor(category)"
                                            class="mt-2"
                                            height="6"
                                            rounded></v-progress-linear>
                                        <div v-if="!isUnlocked(achievement.id)" class="text-caption mt-1">
                                            {{ getProgress(achievement.id) }} / {{ achievement.target }}
                                        </div>
                                        <v-chip v-else size="x-small" color="success" class="mt-2">
                                            <v-icon start size="12">mdi-check</v-icon>Unlocked
                                        </v-chip>
                                    </v-card-text>
                                </v-card>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Achievement Detail Dialog -->
        <v-dialog v-model="detailDialog" max-width="400">
            <v-card v-if="selectedAchievement">
                <v-card-title class="d-flex align-center">
                    <v-avatar
                        :size="48"
                        :color="
                            isUnlocked(selectedAchievement.id) ? getCategoryColor(selectedAchievement.category) : 'grey'
                        ">
                        <v-icon :size="28" color="white">{{ selectedAchievement.icon }}</v-icon>
                    </v-avatar>
                    <span class="ml-3">{{ selectedAchievement.name }}</span>
                </v-card-title>
                <v-card-text>
                    <p>{{ selectedAchievement.description }}</p>
                    <v-divider class="my-3"></v-divider>
                    <div v-if="isUnlocked(selectedAchievement.id)">
                        <v-chip color="success" variant="tonal"
                            ><v-icon start>mdi-check-circle</v-icon>Unlocked on
                            {{ formatUnlockDate(selectedAchievement.id) }}</v-chip
                        >
                    </div>
                    <div v-else>
                        <div class="text-subtitle-2 mb-2">
                            Progress: {{ getProgress(selectedAchievement.id) }} / {{ selectedAchievement.target }}
                        </div>
                        <v-progress-linear
                            :model-value="getProgressPercent(selectedAchievement)"
                            :color="getCategoryColor(selectedAchievement.category)"
                            height="10"
                            rounded></v-progress-linear>
                    </div>
                </v-card-text>
                <v-card-actions
                    ><v-spacer></v-spacer
                    ><v-btn color="primary" @click="detailDialog = false">Close</v-btn></v-card-actions
                >
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script>
import { mapGetters } from "vuex"
export default {
    name: "AchievementCard",
    data() {
        return { detailDialog: false, selectedAchievement: null }
    },
    computed: {
        ...mapGetters([
            "allAchievements",
            "achievementsByCategory",
            "totalUnlocked",
            "totalAchievements",
            "completionPercentage",
            "achievementProgress"
        ])
    },
    methods: {
        isUnlocked(id) {
            return this.achievementProgress(id)?.unlocked || false
        },
        getProgress(id) {
            return this.achievementProgress(id)?.progress || 0
        },
        getProgressPercent(a) {
            return Math.min((this.getProgress(a.id) / a.target) * 100, 100)
        },
        getUnlockedInCategory(achievements) {
            return achievements.filter(a => this.isUnlocked(a.id)).length
        },
        formatCategory(cat) {
            return cat.charAt(0).toUpperCase() + cat.slice(1)
        },
        getCategoryColor(cat) {
            return (
                { milestones: "primary", streaks: "warning", exploration: "success", dedication: "info" }[cat] || "grey"
            )
        },
        getCategoryIcon(cat) {
            return (
                {
                    milestones: "mdi-flag-checkered",
                    streaks: "mdi-fire",
                    exploration: "mdi-compass",
                    dedication: "mdi-clock"
                }[cat] || "mdi-trophy"
            )
        },
        showDetails(a) {
            this.selectedAchievement = a
            this.detailDialog = true
        },
        formatUnlockDate(id) {
            const d = this.achievementProgress(id)?.unlockedAt
            return d
                ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : "-"
        },
        exportAchievements() {
            this.$store.dispatch("exportAchievements")
        }
    }
}
</script>

<style scoped>
.achievement-card {
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
}
.achievement-card:hover {
    transform: translateY(-2px);
}
.achievement-card.locked {
    opacity: 0.7;
}
.achievement-card.unlocked {
    border: 2px solid rgba(var(--v-theme-success), 0.5);
}
</style>
