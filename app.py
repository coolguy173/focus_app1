"""
Focus Battle - Flask Backend
================================
This is the main application file. It handles:
- All routes (URLs the browser can visit)
- Database setup and queries
- User authentication (login/signup/logout)
- Session tracking (wins, losses, streaks)

HOW FLASK ROUTES WORK:
  @app.route('/path') decorates a function so Flask knows what
  code to run when someone visits that URL in their browser.

HOW SESSIONS WORK:
  Flask stores a session cookie in the browser. It's like a
  sticky note that says "this browser is logged in as username X".
  We check session['user_id'] to know who's making a request.
"""

from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os

# ── App Setup ───────────────────────────────────────────────────────────────
app = Flask(__name__)

# Secret key encrypts the session cookie so users can't tamper with it.
# In production, load this from an environment variable, never hardcode it.
app.secret_key = os.environ.get('SECRET_KEY', 'focus-battle-secret-change-in-prod')


DATABASE = 'focus_battle.db'


# ── Database Helpers ─────────────────────────────────────────────────────────

def get_db():
    """
    Open a connection to the SQLite database.
    SQLite stores everything in a single file (focus_battle.db).
    row_factory lets us access columns by name (row['username'])
    instead of by index (row[1]).
    """
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Create tables if they don't exist yet.
    This runs once when the app starts.

    HOW DATABASE QUERIES WORK:
      We write SQL strings and execute them against the database.
      'IF NOT EXISTS' means we won't crash if tables already exist.
    """
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            wins          INTEGER DEFAULT 0,
            losses        INTEGER DEFAULT 0,
            streak        INTEGER DEFAULT 0
        );
    """)
    conn.commit()
    conn.close()


# ── Auth Helpers ─────────────────────────────────────────────────────────────

def current_user():
    """
    Return the logged-in user's row from the database,
    or None if nobody is logged in.
    """
    user_id = session.get('user_id')
    if not user_id:
        return None
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return user


def login_required(f):
    """
    Decorator that redirects to login page if user is not logged in.
    Usage: @login_required above any route that needs authentication.
    """
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


# ── Routes: Auth ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Redirect root URL: dashboard if logged in, else login."""
    if session.get('user_id'):
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """
    GET  → show the signup form
    POST → process the form data

    DATA FLOW — User Signs Up:
    1. Browser sends username + password via POST request
    2. We check the username isn't taken
    3. We hash the password (NEVER store raw passwords)
    4. We insert the new user into the database
    5. We set session['user_id'] so they're instantly logged in
    6. We redirect to the dashboard

    HOW PASSWORD HASHING WORKS:
      generate_password_hash('mypassword') → '$2b$12$abc...' (60-char string)
      The hash is one-way: you can't reverse it to get 'mypassword'.
      check_password_hash(stored_hash, 'mypassword') returns True/False.
      Even if someone steals the database, they can't recover passwords.
    """
    error = None

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        # Basic validation
        if not username or not password:
            error = 'Username and password are required.'
        elif len(username) < 3:
            error = 'Username must be at least 3 characters.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters.'
        else:
            conn = get_db()
            existing = conn.execute(
                'SELECT id FROM users WHERE username = ?', (username,)
            ).fetchone()

            if existing:
                error = 'That username is already taken.'
            else:
                # Hash the password before storing
                hashed = generate_password_hash(password)
                conn.execute(
                    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                    (username, hashed)
                )
                conn.commit()

                # Fetch the new user's id and log them in
                user = conn.execute(
                    'SELECT id FROM users WHERE username = ?', (username,)
                ).fetchone()
                session['user_id'] = user['id']
                conn.close()
                return redirect(url_for('dashboard'))

            conn.close()

    return render_template('signup.html', error=error)


@app.route('/login', methods=['GET', 'POST'])
def login():
    """
    DATA FLOW — User Logs In:
    1. Browser sends username + password via POST
    2. We look up the user by username
    3. We verify the password against the stored hash
    4. If correct, we store their id in the session cookie
    5. We redirect to dashboard
    """
    error = None

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        conn = get_db()
        user = conn.execute(
            'SELECT * FROM users WHERE username = ?', (username,)
        ).fetchone()
        conn.close()

        if not user or not check_password_hash(user['password_hash'], password):
            error = 'Invalid username or password.'
        else:
            # Store user id in session — this is what keeps them "logged in"
            session['user_id'] = user['id']
            return redirect(url_for('dashboard'))

    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    """Clear the session, effectively logging the user out."""
    session.clear()
    return redirect(url_for('login'))


# ── Routes: Core App ──────────────────────────────────────────────────────────

@app.route('/dashboard')
@login_required
def dashboard():
    """
    Main app page with the focus timer.
    We pass the current user's stats to the template.
    """
    user = current_user()
    return render_template('dashboard.html', user=user)


@app.route('/leaderboard')
@login_required
def leaderboard():
    """
    Fetch the top 20 users ordered by wins descending.
    ORDER BY wins DESC → highest wins first.
    """
    conn = get_db()
    top_users = conn.execute(
        'SELECT username, wins, losses, streak FROM users ORDER BY wins DESC LIMIT 20'
    ).fetchall()
    conn.close()
    return render_template('leaderboard.html', users=top_users, current_user=current_user())


# ── Routes: API (called by JavaScript fetch()) ────────────────────────────────

@app.route('/api/session/win', methods=['POST'])
@login_required
def session_win():
    """
    DATA FLOW — User Completes a Focus Session:
    1. JavaScript timer hits 0:00
    2. JS calls fetch('/api/session/win', { method: 'POST' })
    3. This route increments wins and streak in the database
    4. Returns updated stats as JSON so JS can update the UI
    """
    user_id = session['user_id']
    conn = get_db()
    conn.execute(
        'UPDATE users SET wins = wins + 1, streak = streak + 1 WHERE id = ?',
        (user_id,)
    )
    conn.commit()
    user = conn.execute('SELECT wins, losses, streak FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()

    return jsonify({
        'status': 'win',
        'wins': user['wins'],
        'losses': user['losses'],
        'streak': user['streak']
    })


@app.route('/api/session/loss', methods=['POST'])
@login_required
def session_loss():
    """
    DATA FLOW — User Fails a Focus Session (leaves early / refreshes):
    1. JS detects beforeunload OR explicit abandon
    2. JS calls fetch('/api/session/loss', { method: 'POST' })
       with keepalive: true so the request completes even as page unloads
    3. This route increments losses and resets streak to 0
    4. Returns updated stats as JSON
    """
    user_id = session['user_id']
    conn = get_db()
    conn.execute(
        'UPDATE users SET losses = losses + 1, streak = 0 WHERE id = ?',
        (user_id,)
    )
    conn.commit()
    user = conn.execute('SELECT wins, losses, streak FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()

    return jsonify({
        'status': 'loss',
        'wins': user['wins'],
        'losses': user['losses'],
        'streak': user['streak']
    })


@app.route('/api/stats')
@login_required
def api_stats():
    """Return current user's stats as JSON (used to refresh UI after session)."""
    user = current_user()
    return jsonify({
        'username': user['username'],
        'wins': user['wins'],
        'losses': user['losses'],
        'streak': user['streak']
    })


# ── Entry Point ───────────────────────────────────────────────────────────────
# This runs whether launched via 'python app.py' or 'gunicorn app:app'
# gunicorn imports app.py as a module, so __name__ != '__main__'
# We need init_db() to run in both cases.
with app.app_context():
    init_db()

if __name__ == '__main__':
    init_db()  # Create tables on first run
    # Railway (and most cloud platforms) assign a PORT environment variable.
    # We read it with os.environ.get('PORT', 5000) so it works both
    # locally (defaults to 5000) and in production (uses Railway's port).
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
