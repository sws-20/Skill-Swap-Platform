
import pandas as pd
import numpy as np
import joblib
import os

from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

import nltk
nltk.download('vader_lexicon', quiet=True)
from nltk.sentiment.vader import SentimentIntensityAnalyzer


print("=" * 60)
print("  SkillSwap — Training Mentor Ranking Model")
print("=" * 60)


# ----------------------------------------------------------
# STEP 1: Load dataset
# ----------------------------------------------------------
DATASET = "decimal_rating_dataset_1000.xlsx"

if not os.path.exists(DATASET):
    print(f"\n❌ '{DATASET}' not found! Place it in backend/ml/")
    exit(1)

df = pd.read_csv(DATASET, sep='\t')
df = df.dropna(subset=['feedback', 'rating'])
print(f"\n✅ Loaded {len(df)} rows")


# ----------------------------------------------------------
# STEP 2: Sentiment Analysis on each feedback using VADER
#
#  VADER gives 4 scores per feedback:
#    positive  → how much positive language (0.0 to 1.0)
#    negative  → how much negative language (0.0 to 1.0)
#    neutral   → how neutral the language is (0.0 to 1.0)
#    compound  → overall sentiment (-1.0 = very negative,
#                                   +1.0 = very positive)
# ----------------------------------------------------------
print("\n⏳ Running sentiment analysis on all feedback...")

sia = SentimentIntensityAnalyzer()

def get_sentiment(text):
    scores = sia.polarity_scores(str(text))
    return pd.Series({
        'sent_positive': scores['pos'],
        'sent_negative': scores['neg'],
        'sent_neutral':  scores['neu'],
        'sent_compound': scores['compound']
    })

sentiment_df = df['feedback'].apply(get_sentiment)
df = pd.concat([df, sentiment_df], axis=1)

print("✅ Sentiment analysis complete")
print(f"\n   {'Feedback':<45} {'Rating':>6} {'Compound':>10}")
print("   " + "-" * 65)
for _, row in df.head(6).iterrows():
    print(f"   {str(row['feedback'])[:43]:<45} {row['rating']:>6.1f} {row['sent_compound']:>10.3f}")


# ----------------------------------------------------------
# STEP 3: Build feature matrix
#         TF-IDF (text features) + Sentiment scores
# ----------------------------------------------------------
print("\n⏳ Building feature matrix...")

tfidf = TfidfVectorizer(
    ngram_range=(1, 2),
    max_features=300,
    stop_words='english',
    lowercase=True
)

tfidf_features     = tfidf.fit_transform(df['feedback'].astype(str)).toarray()
sentiment_features = df[['sent_positive', 'sent_negative', 'sent_neutral', 'sent_compound']].values

# Stack text features + sentiment features side by side
X = np.hstack([tfidf_features, sentiment_features])
y = df['rating'].values

print(f"✅ Feature matrix: {X.shape[0]} samples × {X.shape[1]} features")
print(f"   ({tfidf_features.shape[1]} TF-IDF  +  4 sentiment features)")


# ----------------------------------------------------------
# STEP 4: Train / Test Split (80% train, 20% test)
# ----------------------------------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
print(f"\n✅ Train: {len(X_train)}  |  Test: {len(X_test)}")


# ----------------------------------------------------------
# STEP 5: Train Random Forest Regressor
# ----------------------------------------------------------
print("\n⏳ Training Random Forest (200 trees)...")

rf = RandomForestRegressor(
    n_estimators=200,
    max_depth=15,
    min_samples_leaf=2,
    n_jobs=-1,
    random_state=42
)
rf.fit(X_train, y_train)

y_pred = np.clip(rf.predict(X_test), 1.0, 5.0)
mae    = mean_absolute_error(y_test, y_pred)
r2     = r2_score(y_test, y_pred)

print(f"""
✅ Training complete!

   MAE : {mae:.4f}  → off by ~{mae:.2f} stars on average
   R²  : {r2:.4f}  → {r2*100:.1f}% accuracy
""")


# ----------------------------------------------------------
# STEP 6: Save model bundle (RF + TF-IDF + Sentiment tool)
# ----------------------------------------------------------
bundle = {
    'rf':    rf,
    'tfidf': tfidf,
    'sia':   sia
}

joblib.dump(bundle, 'mentor_ranking_model.pkl')
size = os.path.getsize('mentor_ranking_model.pkl') / 1024
print(f"✅ Saved → mentor_ranking_model.pkl  ({size:.0f} KB)")
print("\n   Next step: python api_server.py")