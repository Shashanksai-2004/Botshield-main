# 🛡️ BotShield – Telegram Group Moderation & Anti-Spam Bot

An intelligent Telegram group moderation and anti-spam bot developed in Python. BotShield offers advanced content filtering, user restriction automation, admin commands, and real-time protection to maintain a clean and secure group environment.

---

## 🔍 Project Overview

This project includes:

* Automatic detection and removal of spam, unwanted links, and abusive content.
* Admin-controlled user actions: mute, ban, kick, and unban.
* Flood control with message frequency thresholds.
* Link filtering and keyword-based blacklisting.
* Customizable welcome messages for new users.
* Environment-based configuration for flexible deployment.

---

## 🗂 Project Structure

```
Botshield-main/
│── bot.py                    # Main bot execution script
│── filters/                 # Spam, flood, link, and keyword filters
│── handlers/                # Admin command and user interaction handlers
│── config.py                # Token, thresholds, logging, and environment config
│── .env.example             # Template for environment variables
│── requirements.txt         # Required Python dependencies
│── README.md                # Project documentation
```

---

## 🧼 Key Features & Automation

* **Auto Mute/Ban**: Triggers on repeated violations, adjustable via config.
* **Link Filtering**: Removes any links except those whitelisted.
* **Keyword Blocklist**: Detects and removes messages with banned phrases.
* **Spam Protection**: Flags users posting repeated messages.
* **Admin Panel**: Commands like /mute, /ban, /unban with Telegram ID.
* **Welcome Automation**: Greets new users with instructions.

---

## 🧪 Moderation Logic & Conditions

* Message frequency > threshold → warn → mute → ban.
* Detected spam/keywords/links → delete immediately.
* Flagged users get auto-restricted for defined durations.
* Admins can override actions using Telegram commands.

---

## ⚙️ Configuration Highlights

* `.env` holds sensitive keys: `BOT_TOKEN`, `API_ID`, `API_HASH`, `MONGO_URI`.
* Configurable spam detection thresholds.
* Switches for turning on/off features.
* Logging of actions for audit.

---

## 🛠 Tools & Technologies

Python, Pyrogram, Telegram Bot API, MongoDB (optional), Dotenv, Logging, Git

---

## 💡 Use Case Applications

* Community moderation for large Telegram groups
* Auto-moderation for NFT/crypto/education groups
* Private groups that require structured onboarding & filtering

---

## 🔒 Key Benefits

* Reduces moderator workload by automating repetitive actions
* Increases group quality by removing malicious or irrelevant content
* Makes administration consistent and traceable

---

## 📌 Future Improvements

* Add multilingual support for messages
* Integration with web dashboard for bot controls
* Machine learning-based spam classification
* Group analytics dashboard

---

