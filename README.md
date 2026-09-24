# ThreatFeed — Security Intelligence Daily

> **A polished, modern, client-side-only security news reader that aggregates RSS/Atom feeds and presents them as a beautiful digital newspaper.**

Inspired by the editorial elegance, typography, and usability of **Newsify for iOS**, ThreatFeed transforms security alerts, threat research, and exploit writeups into a high-end digital publication.

---

## 🗞️ Key Features

### 1. Editorial Newspaper Experience
- **Front Page Lead Hierarchy**: Bold hero stories with large editorial typography, supporting secondary features, and asymmetric news streams.
- **True Newspaper Layouts**: Flowing CSS grid and column rules rather than generic card grids or tables.
- **Multiple Layout Modes**: Switch smoothly between:
  - **Newspaper Mode**: Broadsheet editorial hierarchy.
  - **List + Thumbnails**: Modern media-rich newsfeed.
  - **Compact List**: Fast traditional scanner for rapid triage.
- **Freshness Indicators**: Relative timestamps (`12m ago`, `2h ago`, `Yesterday`, `24 Sep`).
- **Editorial Fallbacks**: Never leaves ugly broken image icons; generates threat-themed gradients and branding placeholders.

### 2. Pure Client-Side Architecture (Zero Backend)
- **100% Client-Side**: No Node.js server, no Express, no API routes, no serverless functions, no backend proxy.
- **Deploy Anywhere**: Deployable directly as a static bundle to **GitHub Pages**, **Cloudflare Pages**, **Netlify**, **Vercel Static**, or any static web server (NGINX/Apache/S3).
- **Offline Persistence**: Powered by browser **IndexedDB** (`idb`), storing thousands of articles, read/viewed/bookmarked states, custom tags, and feeds.
- **PWA & Offline First**: Installable Progressive Web App with service worker caching the application shell for offline reading.

### 3. Established Security Feeds Configuration
Pre-configured with curated, verified security feeds organized by category:
- **Security News**: The Hacker News, Krebs on Security, SANS Internet Storm Center, BleepingComputer, SecurityWeek, Dark Reading, Help Net Security.
- **Vulnerabilities**: CISA Advisories, Google Project Zero, PortSwigger Web Security Research, Exploit-DB.
- **Threat Intelligence**: Cisco Talos, Microsoft Security, SentinelOne Labs, Securelist (Kaspersky).
- **Malware Research**: Malwarebytes Labs, ESET WeLiveSecurity, Sophos X-Ops.
- **Red Team & Offensive Tradecraft**: SpecterOps, Bishop Fox.
- **Blue Team & Detection Engineering**: Huntress, Elastic Security Labs.

### 4. Feed Management & OPML Interoperability
- Add custom RSS 2.0 or Atom XML feeds directly in the UI.
- Enable, disable, edit, and delete feeds.
- **OPML 2.0 Import & Export** for seamless migration between RSS readers.
- **Full JSON Backup & Restore** of all subscriptions, read state, bookmarks, and settings.
- Reset to default curated security feeds anytime with 1 click.

### 5. Client-Side CORS Handling & Feed Health Telemetry
- Transparent handling of browser cross-origin limitations with real-time health badges:
  - `Healthy ●`
  - `CORS Restriction ●`
  - `Invalid XML ●`
  - `Timeout ●`
  - `HTTP Error ●`
- Configurable fetch modes in Settings:
  - **CORS Proxy (`corsproxy.io`)** (Default for seamless client-side reading)
  - **AllOrigins (`allorigins.win`)**
  - **Direct Browser Fetch (Strict Origin)**
  - **Custom User Proxy**
- Individual retry buttons for every feed.

### 6. Distraction-Free Article Reader
- Dedicated reading view with full typography controls.
- Displays source, date, author, hero image, and sanitized description.
- **"Read Original Article →"** primary action.
- Custom tag adder: add your own threat tags (e.g. `+APT28`, `+ZeroDay`, `+ActiveDirectory`) to any article.
- Integrated Web Share API and 1-click clipboard copy.

### 7. Instant Search, Combinable Filters & Sorting
- Client-side full-text search across titles, summaries, sources, tags, and authors.
- Combinable filters:
  - Category (Security News, Threat Intel, Vulnerabilities, Malware, Red Team, Blue Team, Research)
  - Source feed
  - Threat topic tags (`#Zero-Day`, `#Ransomware`, `#CVE`, `#Exploit`, `#APT`, etc.)
  - Reading state (`All`, `Unread`, `Read`)
  - Date ranges (`Today`, `Past 7 Days`, `Past 30 Days`)
  - Sorting (`Newest`, `Oldest`, `Recently Read`, `Recently Viewed`)

### 8. Customization & Genuine Dark Mode
- **Dark Mode Palette**: Genuine cybersecurity night palette (`#0b0d10`, `#11151a`, `#f5f7fa`, `#9ba3af`, `#252b33`).
- **Light Mode Palette**: Crisp print editorial aesthetic.
- **Custom Accents**: Crimson, Amber, Emerald, Cyber Cyan, Electric Blue, Violet, or custom hex picker.
- **Newspaper Customizer**: Spacing (compact, comfortable, spacious), borders (none, subtle, strong), image sizing, and typography scale.

### 9. Keyboard Navigation Shortcuts
- <kbd>r</kbd> : Refresh all enabled feeds
- <kbd>f</kbd> or <kbd>/</kbd> : Focus search input
- <kbd>j</kbd> / <kbd>k</kbd> : Navigate next / previous article
- <kbd>o</kbd> : Open original article at external source
- <kbd>m</kbd> : Toggle read / unread status
- <kbd>b</kbd> : Bookmark / unbookmark article
- <kbd>?</kbd> : Display keyboard shortcuts cheat sheet
- <kbd>Esc</kbd> : Dismiss reader view or modals

### 10. Printable Broadsheet Newspaper
- Built-in print stylesheet (`@media print`).
- Clicking **"Print Newspaper Edition"** removes all application chrome, buttons, and navigation, formatting the day's security reports into a real black-and-white physical newspaper layout with date and masthead.

---

## 🛠️ Technology Stack

- **Framework**: React 18 + TypeScript
- **Bundler**: Vite
- **Styling**: Tailwind CSS + Custom CSS Variables + Print Media Queries
- **Typography**: Newsreader (Editorial Serif) + Inter (Sans-Serif UI) + JetBrains Mono (Code/Threat Indicators)
- **Local Persistence**: IndexedDB via `idb`
- **Security & Sanitization**: DOMPurify
- **Icons**: Lucide React

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production static website (dist/)
npm run build

# Preview static build
npm run preview
```

---

## 🌐 Static Deployment

ThreatFeed produces completely static HTML, CSS, and JavaScript files in `dist/`.

### Deploy to Cloudflare Pages / Netlify / Vercel
- Build command: `npm run build`
- Output directory: `dist`

### Deploy to GitHub Pages
Simply publish the contents of the `dist/` directory to your `gh-pages` branch.
