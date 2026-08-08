# NeuroSpell AI 🧠⚡

> **AI-Powered P300 Neurotechnology OS — Empowering Paralyzed Lives with Agentic BCI Orchestration**

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-4.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![PyTorch](https://img.shields.io/badge/PyTorch-EEGNet-ee4c2c?logo=pytorch)](https://pytorch.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌐 Live Landing Page

One platform to translate raw **P300 brainwaves** into real-time speech, emergency caregiver alerts, and smart home automation — trained on 18 subjects, achieving **92.4% character accuracy** at **< 100ms inference latency**.

---

## 📸 Screenshots

| Hero HUD | Module Deep Dives |
|---|---|
| ![Hero](public/hero-montage.png) | ![Modules](public/podcast-host.png) |

---

## 🚀 Features

### 💬 Module 1 — BCI Speller & Predictive LLM
Real-time **6×6 alphanumeric matrix speller** powered by deep neural networks (PyTorch EEGNet). Features:
- Context-aware **LLM word completion** top-row (reduces typing latency by **80%**)
- Live **6-channel EEG waveform** visualizer highlighting Cz & Pz P300 spikes
- **Web Speech API** Text-to-Speech (TTS) voice synthesizer

**Key Badges:** `6×6 Matrix` · `LLM Predictor` · `Web Speech TTS`

---

### 🚨 Module 2 — Nurse Emergency Alert System
Hands-free, **1-step panic alert** trigger for immediate medical care:
- Automated **Twilio SMS** notifications to family/nurses
- In-room **audible chime alarms**
- Categorized quick-request tiles: *Need Water*, *High Pain*, *Adjust Position*

**Key Badges:** `1-Click Panic` · `Twilio SMS API` · `Categorized Needs`

---

### 🏠 Module 3 — Smart Home & Environmental Controls
Direct **brainwave command interface** connected to IoT smart home systems:
- Adjust room **smart lighting**
- Control **smart thermostats**
- Operate **motorized hospital bed** positioning
- Trigger **audio/video entertainment**

**Key Badges:** `Smart Lighting` · `Bed Positioning` · `Climate & Media`

---

## 📊 Platform Stats

| Metric | Value |
|--------|-------|
| Training Subjects | 18 (s01 – s18) |
| Character Accuracy | **92.4%** |
| Inference Latency | **< 100ms** (PyTorch) |
| ITR | **24.5 bits/min** |
| Calibration Required | **0-Shot (None)** |
| EEG Sampling Rate | **512 Hz** via LSL |
| Model | `eegnet_p300.pt` |

---

## 🧠 How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────────┐
│  01. STREAM &   │────▶│  02. CLASSIFY &  │────▶│  03. ACT &             │
│  DETECT P300    │     │  PREDICT         │     │  COMMUNICATE           │
│                 │     │                  │     │                        │
│  EEG Headset    │     │  PyTorch EEGNet  │     │  → Web Speech TTS      │
│  LSL @ 512 Hz   │     │  92.4% accuracy  │     │  → Twilio SMS Alert    │
│  8 Channels     │     │  LLM Completion  │     │  → IoT Smart Home      │
└─────────────────┘     └──────────────────┘     └────────────────────────┘
```

---

## 🏗️ Tech Stack

### Frontend (Landing Page)
| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | React framework with Turbopack |
| **TypeScript 5.7** | Type-safe component development |
| **Tailwind CSS v4** | Utility-first styling |
| **shadcn/ui** | Glassmorphism UI component system |
| **Lucide React** | Icon library |
| **Geist Font** | Premium typography |

### BCI Backend (Research Engine)
| Technology | Purpose |
|---|---|
| **PyTorch** | EEGNet deep learning model |
| **Lab Streaming Layer (LSL)** | Real-time EEG data streaming |
| **EEGNet** | Compact depthwise-separable CNN for EEG |
| **Twilio API** | Emergency SMS dispatch |
| **Web Speech API** | Browser-native TTS synthesis |
| **IoT / MQTT** | Smart home device control |

---

## 📁 Project Structure

```
neurospell-ai/
├── app/
│   ├── globals.css          # Dark cinematic design tokens
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Main landing page assembly
├── components/
│   ├── home/
│   │   ├── hero.tsx         # Hero + BCI HUD showcase card
│   │   ├── social-proof.tsx # Platform metrics bar
│   │   ├── feature-suite.tsx    # 3-module hub diagram
│   │   ├── feature-deep-dives.tsx  # Module deep-dive sections
│   │   ├── how-it-works.tsx # 3-step pipeline
│   │   ├── tech-stack.tsx   # Research architecture
│   │   ├── testimonials.tsx # Clinical case studies
│   │   ├── pricing.tsx      # Research / Clinical / Enterprise tiers
│   │   └── final-cta.tsx    # Call-to-action section
│   ├── site-nav.tsx         # Navigation bar
│   └── site-footer.tsx      # Footer with platform stats
├── public/
│   ├── hero-montage.png     # NeuroSpell HUD image
│   ├── podcast-host.png     # BCI speller module visual
│   ├── futuristic-city-rain.png  # Emergency alert module visual
│   └── thumb-face.png       # Smart home module visual
└── package.json
```

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9

### Installation

```bash
# Clone the repository
git clone https://github.com/Tanisharma122/NeuroSpell-AI-EEG-.git
cd NeuroSpell-AI-EEG-

# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 💡 Design System

The landing page uses a **Dark Cinematic AI Studio** design language:

- 🖤 **Black canvas background** (`oklch(0 0 0)`)
- 💙 **Blue radial gradients** (`oklch(0.62 0.19 255)` brand blue)
- 🪟 **Glassmorphism cards** with `backdrop-blur` and semi-transparent borders
- ✨ **Glowing button shadows** (`shadow-brand/70`)
- 🔤 **Geist typeface** for premium readability

---

## 📜 Research Context

This landing page represents the **NeuroSpell AI** BCI research project:

- **Dataset:** BCI Competition P300 Speller (18 subjects, s01–s18)
- **Model:** PyTorch EEGNet trained with subject-independent cross-validation
- **Architecture:** Depthwise separable CNN with temporal & spatial filters
- **Output pipeline:** Agentic multi-module system (TTS + SMS + IoT)
- **Goal:** Zero-calibration deployment for paralyzed/locked-in patients

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

MIT © 2026 NeuroSpell AI — Empowering paralyzed lives with P300 neurotechnology.
