from flask import Flask, render_template, request, jsonify, flash, session, redirect, url_for, get_flashed_messages
import joblib
import psycopg2
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import time
from functools import wraps
from Aichatbot.chat import chat
from flask_socketio import SocketIO, emit

app_password = "wyhw yrii mhen nhxg"

app = Flask(__name__)
app.secret_key = 'behavior'
socketio = SocketIO(app)

model = joblib.load(r"D:\Downloads\Botshieldzack\Botshieldzam\Botshield-main\decision_tree_user1.pkl")

email_cooldown = {}  
bot_detected_sessions = set() 
bot_lockout_times = {}  
failed_attempts = {}  
ip_failed_attempts = {}  
lockout_duration = 300  
max_failed_attempts = 5  
email_alert_threshold = 3  

def connect_to_db():
    """
    Connect to the PostgreSQL database.
    Returns:
        psycopg2.extensions.connection: Database connection object.
    Raises:
        ValueError: If connection fails.
    """
    try:
        return psycopg2.connect(
            dbname='mouse_patterns',
            user='postgres',
            password='venky@123',
            host='localhost',
            port=5432
        )
    except Exception as e:
        print(f"Failed to connect to database: {str(e)}")
        raise

conn = connect_to_db()
cursor = conn.cursor()

def initialize_database():
    """
    Initialize the database by creating necessary tables if they don't exist.
    """
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS behavior_tracking (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                name VARCHAR(255),
                typing_speed FLOAT,
                scroll_speed FLOAT,
                status VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failed_login_attempts (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                ip_address VARCHAR(45),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login (
                user_id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255)
            )
        """)
        conn.commit()
        print("Database tables initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
        conn.rollback()

initialize_database()

try:
    cursor.execute("""
        ALTER TABLE behavior_tracking ADD COLUMN IF NOT EXISTS scroll_speed FLOAT;
    """)
    conn.commit()
    print("Added scroll_speed column to behavior_tracking table.")
except Exception as e:
    print(f"Error adding scroll_speed column: {e}")
    conn.rollback()

def is_account_locked(username):
    """
    Check if the account is locked due to too many failed login attempts.
    """
    if username in failed_attempts and failed_attempts[username]['locked']:
        remaining_time = lockout_duration - (time.time() - failed_attempts[username]['lock_time'])
        if remaining_time > 0:
            return True, int(remaining_time)
        else:
           
            del failed_attempts[username]
    return False, 0

def is_ip_locked(ip_address):
    """
    Check if the IP address is locked due to too many failed login attempts.
    """
    if ip_address in ip_failed_attempts and ip_failed_attempts[ip_address]['locked']:
        remaining_time = lockout_duration - (time.time() - ip_failed_attempts[ip_address]['lock_time'])
        if remaining_time > 0:
            return True, int(remaining_time)
        else:
            
            del ip_failed_attempts[ip_address]
    return False, 0

def log_failed_attempt(username, ip_address):
    """
    Log a failed login attempt in the database.
    """
    try:
        cursor.execute("""
            INSERT INTO failed_login_attempts (username, ip_address, timestamp)
            VALUES (%s, %s, NOW())
        """, (username, ip_address))
        conn.commit()
    except Exception as e:
        print(f"Error logging failed attempt: {e}")
        conn.rollback()

def login_required(f):
    """
    Decorator to ensure user is logged in.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect('/login')
        return f(*args, **kwargs)
    return decorated_function

def send_email_alert(to_email, subject, body):
    """
    Send an email alert to the user.
    """
    sender_email = "botshield6@gmail.com"
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, app_password)
        server.sendmail(sender_email, to_email, msg.as_string())
        server.quit()
        print(f"Alert email sent successfully to {to_email}.")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")

@app.route('/')
def home():
    return render_template("about.html")

@app.route('/register')
def register():
    """
    Render the registration page.
    """
    return render_template('register.html')

@app.route('/add_users', methods=['POST'])
def add_users():
    """
    Handle user registration.
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        name = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if not name or not email or not password or not confirm_password:
            flash('All fields are required.', 'danger')
            return redirect('/register')
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return redirect('/register')

        cursor.execute("""
            INSERT INTO login(name, email, password)
            VALUES(%s, %s, %s)
            """, (name, email, password))
            
        conn.commit()
        cursor.execute("SELECT user_id FROM login WHERE email = %s", (email,))
        user_id = cursor.fetchone()[0]
        
       
        session['user_id'] = user_id
        session['user_name'] = name
        session['user_email'] = email

        flash('Registration successful!', 'success')
        return redirect('/login')
        
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        flash('Email already exists.', 'danger')
        return redirect('/register')
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        flash(f'Error: {str(e)}', 'danger')
        return redirect('/register')
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/login')
def login():
    email = session.get('last_attempted_email', '')
    ip_address = request.remote_addr
    account_locked, account_remaining_time = is_account_locked(email)
    ip_locked, ip_remaining_time = is_ip_locked(ip_address)

    bot_locked = False
    bot_remaining_time = 0
    if ip_address in bot_lockout_times:
        lockout_time = bot_lockout_times[ip_address]
        if datetime.now() < lockout_time:
            bot_locked = True
            bot_remaining_time = (lockout_time - datetime.now()).seconds
            flashed_messages = [msg for cat, msg in get_flashed_messages(with_categories=True)]
            bot_lockout_message = f'Access denied due to bot detection. Please wait {bot_remaining_time} seconds before trying again.'
            if bot_lockout_message not in flashed_messages:
                flash(bot_lockout_message, 'danger')
        else:
            del bot_lockout_times[ip_address]

    is_locked = account_locked or ip_locked or bot_locked
    remaining_time = max(account_remaining_time, ip_remaining_time, bot_remaining_time) if is_locked else 0

    if is_locked and not bot_locked:
        flashed_messages = [msg for cat, msg in get_flashed_messages(with_categories=True)]
        lockout_message = f'Account or IP locked due to too many failed attempts. Please wait {remaining_time} seconds before trying again.'
        if lockout_message not in flashed_messages:
            flash(lockout_message, 'danger')

    return render_template("login.html", is_locked=is_locked, remaining_time=remaining_time)

@app.route('/login_validation', methods=['POST'])
def login_validation():
    if 'user_id' in session and session['user_id'] in bot_detected_sessions:
        bot_detected_sessions.remove(session['user_id'])
    email = request.form.get('username')
    password = request.form.get('password')
    ip_address = request.remote_addr

    session['last_attempted_email'] = email

    account_locked, account_remaining_time = is_account_locked(email)
    if account_locked:
        return redirect('/login')

    ip_locked, ip_remaining_time = is_ip_locked(ip_address)
    if ip_locked:
        return redirect('/login')

    if ip_address in bot_lockout_times:
        lockout_time = bot_lockout_times[ip_address]
        if datetime.now() < lockout_time:
            remaining_time = (lockout_time - datetime.now()).seconds
            flash(f'Access denied due to bot detection. Please wait {remaining_time} seconds before trying again.', 'danger')
            return redirect('/login')
        else:
            del bot_lockout_times[ip_address]

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, name, email FROM login WHERE email = %s AND password = %s", (email, password))
        user = cursor.fetchone()

        if user:
            session['user_id'] = user[0]
            session['user_name'] = user[1]
            session['user_email'] = user[2]
            session['session_count'] = 1
            
            if email in failed_attempts:
                del failed_attempts[email]
            if ip_address in ip_failed_attempts:
                del ip_failed_attempts[ip_address]
            
            return redirect('/starter')
        else:
            if email not in failed_attempts:
                failed_attempts[email] = {'count': 0, 'locked': False}
            failed_attempts[email]['count'] += 1

            if ip_address not in ip_failed_attempts:
                ip_failed_attempts[ip_address] = {'count': 0, 'locked': False}
            ip_failed_attempts[ip_address]['count'] += 1

            log_failed_attempt(email, ip_address)

            if failed_attempts[email]['count'] == email_alert_threshold:
                send_email_alert(email, "Suspicious Login Attempts", f"""
                Dear User,

                We have detected {email_alert_threshold} failed login attempts on your account from IP address {ip_address}.
                If this was not you, please secure your account immediately.

                Best regards,
                Bot Shield Team
                """)

            if failed_attempts[email]['count'] >= max_failed_attempts:
                failed_attempts[email]['locked'] = True
                failed_attempts[email]['lock_time'] = time.time()
                return redirect('/login')
            else:
                flash('Invalid email or password', 'danger')
                flash(f'Attempts left: {max_failed_attempts - failed_attempts[email]["count"]}', 'warning')

            if ip_failed_attempts[ip_address]['count'] >= max_failed_attempts:
                ip_failed_attempts[ip_address]['locked'] = True
                ip_failed_attempts[ip_address]['lock_time'] = time.time()
                flash(f'Account or IP locked due to too many failed attempts. Please wait {lockout_duration-1} seconds before trying again.', 'danger')
                return redirect('/login')

            return redirect('/login')
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/starter')
@login_required
def starter():
    name = session.get('user_name')
    if name:
        return render_template("index1.html", name=name)
    else:
        flash('Please log in first.', 'warning')
        return redirect('/login')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template("dashboard.html")

@app.route('/api/bot_human_sessions')
def api_bot_human_sessions():
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT DATE(timestamp) as day, status, COUNT(*)
            FROM behavior_tracking
            GROUP BY day, status
            ORDER BY day ASC
        ''')
        rows = cursor.fetchall()
        day_status = {}
        for day, status, count in rows:
            day = str(day)
            if day not in day_status:
                day_status[day] = {'Bot': 0, 'Human': 0}
            if status == 'Bot':
                day_status[day]['Bot'] = count
            else:
                day_status[day]['Human'] = count
        dates = sorted(day_status.keys())
        bots = [day_status[d]['Bot'] for d in dates]
        humans = [day_status[d]['Human'] for d in dates]
        return jsonify({'dates': dates, 'bots': bots, 'humans': humans})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/dashboard')
def get_dashboard_data():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT name, typing_speed, scroll_speed, status, timestamp, 
                   COALESCE(probability, 0) as probability, COALESCE(explanation, '') as explanation
            FROM behavior_tracking 
            WHERE user_id = %s
            ORDER BY timestamp DESC 
            LIMIT 10
        """, (user_id,))
        recent_activities = cursor.fetchall()
        
        activities = []
        for row in recent_activities:
            typing_speed = row[1] if row[1] is not None else 0
            scroll_speed = row[2] if row[2] is not None else 0
            status = row[3]
            explanation = row[6]
            if not explanation or not explanation.strip():
                if status == 'Bot':
                    if typing_speed < 50 and scroll_speed > 3000:
                        explanation = 'Bot detected: Extremely fast typing and high scroll speed.'
                    elif typing_speed < 70:
                        explanation = 'Bot detected: Very fast typing speed.'
                    elif scroll_speed > 3000:
                        explanation = 'Bot detected: Abnormally high scroll speed.'
                    else:
                        explanation = 'Bot detected due to suspicious user activity pattern.'
                else:
                    if typing_speed > 100 and scroll_speed < 1500:
                        explanation = 'Human-like behavior: Normal typing and scrolling.'
                    elif typing_speed > 100:
                        explanation = 'Human-like behavior: Normal typing speed.'
                    elif scroll_speed < 1500:
                        explanation = 'Human-like behavior: Normal scroll speed.'
                    else:
                        explanation = 'Human detected based on user activity.'
            activities.append({
                "username": row[0],
                "typing_speed": typing_speed,
                "scroll_speed": scroll_speed,
                "status": status,
                "timestamp": row[4].strftime("%Y-%m-%d %H:%M:%S"),
                "probability": row[5],
                "explanation": explanation
            })

        cursor.execute("""
            SELECT status FROM behavior_tracking
            WHERE user_id = %s
            ORDER BY timestamp DESC
            LIMIT 1
        """, (user_id,))
        latest_status_row = cursor.fetchone()
        latest_session_status = latest_status_row[0] if latest_status_row else "Unknown"

        cursor.execute("""
            SELECT COUNT(*), 
                SUM(CASE WHEN status = 'Bot' THEN 1 ELSE 0 END),
                AVG(typing_speed),
                AVG(scroll_speed)
            FROM behavior_tracking
            WHERE user_id = %s
        """, (user_id,))
        row = cursor.fetchone()
        total_sessions = row[0] or 0
        flagged_sessions = row[1] or 0
        avg_typing_speed = float(row[2]) if row[2] is not None else 0.0
        avg_scroll_speed = float(row[3]) if row[3] is not None else 0.0

      
        cursor.execute("SELECT probability FROM behavior_tracking WHERE user_id = %s AND probability IS NOT NULL ORDER BY timestamp DESC LIMIT 100", (user_id,))
        probability_rows = cursor.fetchall()
        probability_distribution = [float(row[0]) for row in probability_rows if row[0] is not None]

        return jsonify({
            "recent_activities": activities,
            "latest_session_status": latest_session_status,
            "total_sessions": total_sessions,
            "flagged_sessions": flagged_sessions,
            "avg_typing_speed": avg_typing_speed,
            "avg_scroll_speed": avg_scroll_speed,
            "probability_distribution": probability_distribution
        })
    except Exception as e:
        import logging
        logging.error(f"Error in get_dashboard_data: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/behavior', methods=['POST'])
def track_behavior():
    data = request.json
    typing_speed = data.get('typing_speed', 0)
    keystroke_count = data.get('keystroke_count', 0)
    scroll_speed = data.get('scroll_speed', 0)
    suspicious_count = data.get('suspicious_count', 0)
    paste_count = data.get('paste_count', 0)
    user_id = session.get('user_id')
    user_name = session.get('user_name', 'Unknown')
    
    ip_address = request.remote_addr
    
    if user_id in bot_detected_sessions:
        return jsonify({
            "prediction": "Bot",
            "reasons": ["Bot already detected for this session"],
            "lockout": True,
            "message": "Bot behavior detected. Access denied for 54 seconds.",
            "probability": 1.0,
            "explanation": "Bot already detected for this session"
        })
    
    is_bot = False
    reasons = []
    status = "Human"
    probability = 0.0
    explanation = ""
    
    
    if keystroke_count >= 10 and typing_speed > 0 and typing_speed < 50:
        is_bot = True
        reasons.append("Extremely fast typing speed detected")
        explanation += "Extremely fast typing speed detected. "
        status = "Bot"
        print(f"[DEBUG] Bot detected by fast typing: {typing_speed} ms/keystroke (keystrokes: {keystroke_count})")
    
   
    if suspicious_count >= 3 or paste_count >= 2 or scroll_speed > 5000:
        if typing_speed > 10 or paste_count >= 2 or scroll_speed > 5000:
            is_bot = True
            if scroll_speed > 5000:
                reasons.append("Excessive scroll speed detected")
                explanation += "Excessive scroll speed detected. "
            if typing_speed > 10:
                reasons.append("Consistently abnormal typing speed detected")
                explanation += "Consistently abnormal typing speed detected. "
            if paste_count >= 2:
                reasons.append("Multiple paste operations detected")
            status = "Bot"
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO behavior_tracking (user_id, name, typing_speed, scroll_speed, status, timestamp)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """, (user_id, user_name, typing_speed, scroll_speed, status))
        conn.commit()
        
        if is_bot:
            bot_detected_sessions.add(user_id)
            bot_lockout_times[ip_address] = datetime.now() + timedelta(seconds=60)
            
            user_email = session.get('user_email')
            if user_email:
                current_time = datetime.now()
                last_email_time = email_cooldown.get(user_email)
                
                if not last_email_time or (current_time - last_email_time).total_seconds() > 300:
                    email_cooldown[user_email] = current_time
                    send_email_alert(user_email, "Bot Detected", """
                    Dear User,

                    An unauthorized user (bot) was detected attempting to use your account on our website. 
                    As a precaution, you have been logged out automatically.

                    If this was not you, please contact support immediately.

                    Best regards,
                    Bot Shield Team
                    """)
    
        activity_data = {
            "typing_speed": typing_speed,
            "scroll_speed": scroll_speed,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "status": status,
            "probability": probability,
            "explanation": explanation
        }
        socketio.emit('activity_update', activity_data)
        return jsonify({
            "prediction": status,
            "reasons": reasons if reasons else ["Normal behavior detected"],
            "lockout": is_bot,
            "message": "Bot behavior detected. Access denied for 60 seconds." if is_bot else "Normal behavior detected.",
            "probability": probability,
            "explanation": explanation
        })
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/init_db', methods=['POST'])
def init_db():
    conn = connect_to_db()
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE behavior_tracking ADD COLUMN IF NOT EXISTS probability FLOAT;")
        cursor.execute("ALTER TABLE behavior_tracking ADD COLUMN IF NOT EXISTS explanation TEXT;")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failed_login_attempts (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                ip_address VARCHAR(45),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        return jsonify({"message": "Database initialized successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/logout', methods=['GET', 'POST'])
def logout():
    user_id = session.get('user_id')
    if user_id in bot_detected_sessions:
        bot_detected_sessions.remove(user_id)
    session.clear()
    return redirect(url_for('login'))

@app.route('/account')
@login_required
def account():
    return render_template('account.html')

@app.route('/base.html')
def basepage():
    return render_template('base.html')

@app.route('/bootstrap.html')
def bootstrappage():
    return render_template('bootstrap.html')

@app.route('/dashboard.html')
def dashboardpage():
    return render_template('dashboard.html')
@app.route("/chat", methods=['POST'])
def chatBot():
    return chat(request)

@app.route('/index.html')
def indexpage():
    return render_template('index.html')

@app.route('/index1.html')
def index1page():
    return render_template('index1.html')

@app.route('/successful.html')
def successfulpage():
    return render_template('successful.html')

@app.route('/temp.html')
def temppage():
    return render_template('temp.html')

@app.route('/test.html')
def testpage():
    return render_template('test.html')

@socketio.on('user_activity')
def handle_user_activity(data):
    typing_threshold = 100  
    scroll_threshold = 1000  
    status = "Bot" if data.get('typing_speed',0) < typing_threshold or data.get('scroll_speed',0) > scroll_threshold else "Human"
    activity = {
        "typing_speed": round(data.get('typing_speed',0), 1),
        "scroll_speed": round(data.get('scroll_speed',0), 1),
        "timestamp": data.get('timestamp', ''),
        "status": status
    }
    emit('activity_update', activity, broadcast=True)

if __name__ == "__main__":
    socketio.run(app, port=2000, debug=True)