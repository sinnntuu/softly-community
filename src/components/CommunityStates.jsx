export function StoryGridSkeleton() {
  return (
    <div className="storyGrid skeletonStoryGrid" aria-label="Loading stories" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="storyCard storyCardSkeleton" key={index}>
          <span className="skeletonStoryArt" />
          <div className="skeletonStoryBody">
            <span /><span /><span /><span />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AchievementPanel({ achievements }) {
  return (
    <section className="achievementPanel" aria-labelledby="achievement-title">
      <div>
        <p className="eyebrow">YOUR PROGRESS</p>
        <h3 id="achievement-title">Achievements</h3>
      </div>
      <div className="achievementGrid">
        {achievements.map((achievement) => {
          const AchievementIcon = achievement.icon;
          return (
            <article
              className={achievement.unlocked ? "unlocked" : "locked"}
              key={achievement.id}
              aria-label={`${achievement.label}: ${achievement.unlocked ? "unlocked" : "locked"}`}
            >
              <span><AchievementIcon size={16} /></span>
              <div>
                <strong>{achievement.label}</strong>
                <small>{achievement.detail}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
