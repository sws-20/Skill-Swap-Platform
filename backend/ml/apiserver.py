
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import joblib
import numpy as np
import os

import nltk
nltk.download('vader_lexicon', quiet=True)

# ----------------------------------------------------------
# Load the trained model bundle
# ----------------------------------------------------------
MODEL_PATH = "mentor_ranking_model.pkl"

if not os.path.exists(MODEL_PATH):
    print(f"\n❌ '{MODEL_PATH}' not found!")
    print("   Run train_model.py first to generate it.")
    exit(1)

bundle = joblib.load(MODEL_PATH)
rf     = bundle['rf']
tfidf  = bundle['tfidf']
sia    = bundle['sia']

print("✅ Model loaded successfully")


# ----------------------------------------------------------
# Core scoring function
# Combines TF-IDF + Sentiment → Random Forest prediction
# ----------------------------------------------------------
def score_mentor(feedbacks: list) -> float:
    """
    Given a list of feedback strings for one mentor,
    returns their predicted quality score (1.0 to 5.0).

    Steps:
      1. Run VADER sentiment on each feedback
      2. Average the sentiment scores
      3. Get TF-IDF vector of combined feedback
      4. Run Random Forest to predict score
    """
    if not feedbacks:
        return 0.0

    combined_text = " ".join(feedbacks)

    # Sentiment scores
    all_sent = [sia.polarity_scores(f) for f in feedbacks]
    avg_pos  = np.mean([s['pos']      for s in all_sent])
    avg_neg  = np.mean([s['neg']      for s in all_sent])
    avg_neu  = np.mean([s['neu']      for s in all_sent])
    avg_comp = np.mean([s['compound'] for s in all_sent])

    # TF-IDF vector of combined text
    tfidf_vec = tfidf.transform([combined_text]).toarray()

    # Stack features
    sentiment_vec = np.array([[avg_pos, avg_neg, avg_neu, avg_comp]])
    X = np.hstack([tfidf_vec, sentiment_vec])

    # Predict
    score = rf.predict(X)[0]
    return round(float(np.clip(score, 1.0, 5.0)), 2)


# ----------------------------------------------------------
# HTTP Request Handler
# ----------------------------------------------------------
class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Clean log format
        print(f"  [{self.command}] {self.path}  →  {args[1]}")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        # CORS headers so your JS frontend can call this
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length))

        # --------------------------------------------------
        # POST /score
        # Scores a single mentor from their feedbacks
        #
        # Request:
        #   { "feedbacks": ["great teacher", "very clear"] }
        #
        # Response:
        #   { "score": 4.35, "sentiment": { "compound": 0.8 } }
        # --------------------------------------------------
        if self.path == '/score':
            feedbacks = body.get('feedbacks', [])
            if not feedbacks:
                self.send_json({'error': 'feedbacks array is required'}, 400)
                return

            score = score_mentor(feedbacks)

            # Also return raw sentiment for transparency
            all_sent = [sia.polarity_scores(f) for f in feedbacks]
            avg_compound = round(float(np.mean([s['compound'] for s in all_sent])), 3)
            avg_positive = round(float(np.mean([s['pos']      for s in all_sent])), 3)
            avg_negative = round(float(np.mean([s['neg']      for s in all_sent])), 3)

            self.send_json({
                'score': score,
                'sentiment': {
                    'compound': avg_compound,
                    'positive': avg_positive,
                    'negative': avg_negative,
                    'label': (
                        'Positive' if avg_compound >= 0.05
                        else 'Negative' if avg_compound <= -0.05
                        else 'Neutral'
                    )
                }
            })

        # --------------------------------------------------
        # POST /rank-mentors
        # Ranks a list of mentors by their ML score
        #
        # Request:
        #   {
        #     "mentors": [
        #       { "uid": "abc", "name": "Alice", "feedbacks": ["great!"] },
        #       { "uid": "xyz", "name": "Bob",   "feedbacks": ["ok"]     }
        #     ]
        #   }
        #
        # Response:
        #   {
        #     "ranked": [
        #       { "uid": "abc", "name": "Alice", "mlScore": 4.5, "rank": 1 },
        #       { "uid": "xyz", "name": "Bob",   "mlScore": 3.1, "rank": 2 }
        #     ]
        #   }
        # --------------------------------------------------
        elif self.path == '/rank-mentors':
            mentors = body.get('mentors', [])
            if not mentors:
                self.send_json({'error': 'mentors array is required'}, 400)
                return

            results = []
            for m in mentors:
                feedbacks = m.get('feedbacks', [])
                ml_score  = score_mentor(feedbacks) if feedbacks else 0.0
                results.append({
                    'uid':     m.get('uid', ''),
                    'name':    m.get('name', ''),
                    'mlScore': ml_score
                })

            # Sort by mlScore descending
            results.sort(key=lambda x: x['mlScore'], reverse=True)
            for i, r in enumerate(results):
                r['rank'] = i + 1

            self.send_json({'ranked': results})

        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)


# ----------------------------------------------------------
# Start server
# ----------------------------------------------------------
PORT = 5000

print(f"""
  SkillSwap ML Ranking Server
  ───────────────────────────
  Running at: http://localhost:{PORT}

  Endpoints:
    POST http://localhost:{PORT}/score
    POST http://localhost:{PORT}/rank-mentors

  Your mlRankingService.js will call these endpoints.
  Keep this terminal open while using the app.
  Press Ctrl+C to stop.
""")

server = HTTPServer(('localhost', PORT), Handler)
server.serve_forever()