"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  X,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  MessageSquare,
  Mail,
  Shield,
  BarChart3,
  Wind,
  Mic,
  CreditCard,
  BookOpen,
  DollarSign,
  FileText,
  Lock,
  Feather,
  ListChecks,
} from "lucide-react";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";

// ── Types ────────────────────────────────────────────────────────────────────

interface FAQItem {
  q: string;
  a: string;
}

interface FAQCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

// ── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ: FAQCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "New to Orryon? Start here.",
    icon: <BookOpen className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "What is Orryon?",
        a: "Orryon is your AI personal concierge. It helps you manage your budget, schedule, goals, notes, habits, and wellness \u2014 all through natural conversation. Think of it as one place that handles the managing so you can focus on living.",
      },
      {
        q: "How do I talk to Orryon?",
        a: "Tap the chat bar on the Home screen and type or speak. You can ask things like \u201cWhat did I spend this week?\u201d, \u201cAdd a dentist appointment for Friday\u201d, or \u201cCreate a savings goal for $2,000.\u201d Orryon understands natural language.",
      },
      {
        q: "Can Orryon remember everything I put in?",
        a: "Yes. Orryon has access to all your data across every feature \u2014 transactions, journal entries, streaks, reset sessions, lists, goals, calendar events, and more. You can ask questions that span any of these: \u201cHow much did I spend on food last month?\u201d, \u201cHow many times did I do breathwork last week?\u201d, \u201cSummarize what I wrote about Edward in my journal.\u201d Orryon looks it up, does the math, and gives you a clear answer.",
      },
      {
        q: "What\u2019s demo mode?",
        a: "Demo mode lets you explore the app without creating an account. Your data stays on the current device only and won\u2019t sync. To get the full experience with cross-device sync, sign up with your email.",
      },
    ],
  },
  {
    id: "finance-budgeting",
    title: "Finance & Budgeting",
    description: "Spending, budgets, bills, and savings goals.",
    icon: <DollarSign className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "How does budgeting work in Orryon?",
        a: "Set your budget categories once (groceries, rent, entertainment, etc.) and Orryon tracks your spending against them automatically. Your balance works like a bank account\u2014it\u2019s always up to date and carries forward. Each budget cycle, your spending progress resets but your categories, limits, and balance stay exactly where they are. You never have to reconfigure anything.",
      },
      {
        q: "How do I log a transaction?",
        a: "Just tell Orryon in chat. Say something like \u201cSpent $45 on groceries\u201d or \u201cPaid $120 for electricity.\u201d Orryon will categorize it, update your budget, and adjust your balance automatically. You can also add transactions from the Finance tab.",
      },
      {
        q: "Can Orryon track my bills?",
        a: "Yes. Add recurring bills by saying something like \u201cI pay $60 for internet on the 15th of every month.\u201d Orryon will remind you before each due date so nothing slips through the cracks.",
      },
      {
        q: "What are savings goals?",
        a: "Savings goals let you set a target amount and track progress toward it. Say \u201cCreate a savings goal for $2,000 for a vacation\u201d and Orryon will help you track contributions over time. You can also ask Orryon how your current spending affects your goals\u2014for example, \u201cCould I save more this month without hurting my Japan trip fund?\u201d",
      },
      {
        q: "Can Orryon look at my past spending?",
        a: "Yes. Orryon has access to your full transaction history and can answer questions across any time range. Ask things like \u201cHow much did I spend on food last month?\u201d, \u201cWhat were my biggest expenses in January?\u201d, or \u201cAm I spending more on dining out than last quarter?\u201d Orryon can cross-reference your spending with your budgets and savings goals to give you personalized advice.",
      },
      {
        q: "Do I have to set up my budget every month?",
        a: "No. Your budget categories and limits persist forever\u2014set them once and they carry forward automatically, month to month, year to year. When a new cycle starts, only the spending progress resets so you get a fresh view. Your balance, transaction history, and everything else stays put. Orryon handles the managing so you don\u2019t have to think about it.",
      },
      {
        q: "Can I change my currency?",
        a: "Yes. Go to Settings \u2192 Financial Preferences and select your currency. This changes how amounts are displayed throughout the app. Orryon supports 18 currencies.",
      },
      {
        q: "When does my budget cycle start?",
        a: "By default, your spending progress resets on the 1st of each month. If your paycheck lands on a different day, you can change this in Settings \u2192 Financial Preferences \u2192 Budget cycle starts. Your balance and budget categories are unaffected\u2014only the spending tracker refreshes.",
      },
      {
        q: "How do spending alerts work?",
        a: "Orryon notifies you when a budget category reaches a percentage threshold you set (default is 80%). You can adjust this in Settings \u2192 Financial Preferences \u2192 Spending alert. This helps you course-correct before going over budget.",
      },
    ],
  },
  {
    id: "streaks-habits",
    title: "Streaks & Habits",
    description: "Track your goals and build consistency.",
    icon: <BarChart3 className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "How do streaks work?",
        a: "Create a streak in the Streaks tab, then mark each day you complete it. Orryon tracks your consecutive days automatically. There\u2019s a one-day grace period \u2014 your streak only breaks after you actually miss two days in a row.",
      },
      {
        q: "Can I set a target for a streak?",
        a: "Yes. When creating or editing a streak, you can set a target (like 21, 30, 66, or 100 days). Orryon will show your progress toward the goal. You can also leave it open-ended.",
      },
      {
        q: "What\u2019s the Daily Reset Anchor streak?",
        a: "It\u2019s a built-in streak that tracks whether you complete at least one Reset Anchor session per day (minimum 2 minutes). It\u2019s created automatically and can\u2019t be deleted.",
      },
      {
        q: "Can I ask Orryon about my streak history?",
        a: "Yes. Orryon knows your full streak history. Ask things like \u201cHow consistent was I with meditation last month?\u201d, \u201cWhat\u2019s my longest streak ever?\u201d, or \u201cDid I work out more this week than last week?\u201d",
      },
    ],
  },
  {
    id: "journal-notes",
    title: "Journal & Notes",
    description: "Capture thoughts, reflect, and stay organized.",
    icon: <Feather className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "What is the Journal?",
        a: "The Journal is your personal space to write down thoughts, reflections, ideas, or anything on your mind. Open it from the navigation bar and start a new entry anytime.",
      },
      {
        q: "How do I create a note?",
        a: "Tap the \u201c+\u201d button in the Journal panel and give it a title. The note opens immediately so you can start writing. You can also ask Orryon in chat: \u201cCreate a note called Morning Thoughts.\u201d",
      },
      {
        q: "Can I tag or categorize notes?",
        a: "Yes. Each note supports tags so you can organize by topic. You can also attach a mood to a note to track how you were feeling when you wrote it.",
      },
      {
        q: "Can I pin important notes?",
        a: "Yes. Pinned notes always appear at the top of your Journal so you can quickly access the ones that matter most.",
      },
      {
        q: "Can I search my notes?",
        a: "Yes. Use the search bar at the top of the Journal panel to find notes by title or content. You can also sort notes by date or name.",
      },
      {
        q: "Can I ask Orryon about my journal?",
        a: "Yes. Orryon can read and recall anything you\u2019ve written. Ask things like \u201cWhat did I write about last Tuesday?\u201d, \u201cSummarize what I wrote about my friend Edward\u201d, or \u201cHow was I feeling last week based on my journal?\u201d Orryon searches your entries and gives you a clear summary.",
      },
      {
        q: "Can I link a note to a goal?",
        a: "Yes. Notes can be linked to a specific goal, which helps you keep related reflections and plans connected to what you\u2019re working toward.",
      },
    ],
  },
  {
    id: "lists",
    title: "Lists",
    description: "Groceries, errands, and anything you need to track.",
    icon: <ListChecks className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "How do I create a list?",
        a: "Go to the Lists tab and tap \u201cNew list.\u201d Give it a name and optionally pick a color. You can also tell Orryon: \u201cCreate a grocery list\u201d or \u201cMake a packing list for my trip.\u201d",
      },
      {
        q: "How do I add items to a list?",
        a: "Open a list and type in the input field at the bottom, or tell Orryon in chat: \u201cAdd milk, eggs, and bread to my grocery list.\u201d Items can be checked off as you complete them.",
      },
      {
        q: "Can I customize list colors?",
        a: "Yes. When creating or editing a list, you can pick from 8 colors (white, red, orange, yellow, green, blue, purple, pink) to help visually distinguish your lists.",
      },
      {
        q: "Can I reorder or delete lists?",
        a: "Yes. You can delete a list from the list overview. Lists are displayed in the order you created them.",
      },
      {
        q: "What\u2019s the difference between lists and tasks?",
        a: "Lists are simple collections of items (like a grocery list or packing checklist). Tasks are action items with optional due dates and reminders that appear in your calendar and task views.",
      },
    ],
  },
  {
    id: "reset-anchors",
    title: "Reset Anchors & Wellness",
    description: "Guided breathing and grounding sessions.",
    icon: <Wind className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "What is a Reset Anchor?",
        a: "A guided breathing or grounding session. Open the Reset tab, pick an anchor (like Box Breathing or Evening Release), and follow the orb. Your mood before and after is tracked so Orryon can learn which resets work best for you.",
      },
      {
        q: "Does the orb speak?",
        a: "Yes. The orb uses a calm voice to guide you through each step. On supported devices it uses AI-generated speech; otherwise it falls back to your browser\u2019s built-in voice.",
      },
      {
        q: "Can I ask Orryon about my wellness history?",
        a: "Yes. Orryon tracks every session you complete, including which anchor you used, how long you went, and your mood before and after. Ask things like \u201cHow many times did I do breathwork last week?\u201d, \u201cWhich reset anchor works best for me?\u201d, or \u201cCompare my wellness this week vs last week.\u201d",
      },
      {
        q: "Is this a replacement for therapy?",
        a: "No. Reset Anchors are general wellness exercises, not medical treatment. If you have a medical or mental health condition, please consult a qualified professional. See our Terms of Service for full details.",
      },
    ],
  },
  {
    id: "voice-ai",
    title: "Voice & AI",
    description: "Speech input and AI capabilities.",
    icon: <Mic className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "Can I use voice input?",
        a: "Yes. Tap the microphone icon in the chat bar to speak your message. Orryon will transcribe it and respond. Voice input works in most modern browsers.",
      },
      {
        q: "How accurate is the AI?",
        a: "Orryon uses xAI\u2019s Grok model, which is highly capable but can occasionally make mistakes. Always verify important financial information independently. The AI improves over time as it learns your preferences.",
      },
    ],
  },
  {
    id: "security-devices",
    title: "Security & Devices",
    description: "Protect your account and manage sessions.",
    icon: <Shield className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "Can I use Orryon on multiple devices?",
        a: "Yes. Your data syncs to your account, so you can sign in from any browser or device and everything will be there.",
      },
      {
        q: "What if my device is lost or stolen?",
        a: "Sign in from any other device, go to Settings \u2192 Active Devices, and tap \u201cSign out all other devices.\u201d This instantly revokes access from every device except the one you\u2019re using.",
      },
      {
        q: "How does sign-in work?",
        a: "Orryon uses passwordless authentication. Enter your email and we send a one-time code. No passwords to remember or leak.",
      },
      {
        q: "Is my data private?",
        a: "Your data is encrypted in transit and stored securely. Orryon never sells your data. You can export or permanently delete everything at any time from Settings \u2192 Data.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Subscription",
    description: "Plans, payments, and data export.",
    icon: <CreditCard className="h-5 w-5" strokeWidth={1.5} />,
    items: [
      {
        q: "How does the free trial work?",
        a: "New users get a 14-day Pro trial with full access. After the trial, a paid subscription is required to continue using Pro features.",
      },
      {
        q: "How do I cancel or change my plan?",
        a: "Go to Settings \u2192 Subscription and tap \u201cManage billing.\u201d This opens the Stripe customer portal where you can switch plans, update your payment method, or cancel.",
      },
      {
        q: "Can I export my data?",
        a: "Yes. Go to Settings \u2192 Data and tap \u201cExport all data.\u201d You\u2019ll get a ZIP file with everything. You can also delete your account entirely from the same section.",
      },
    ],
  },
];

// ── Search helper ────────────────────────────────────────────────────────────

function searchFAQ(query: string): { category: FAQCategory; item: FAQItem }[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: { category: FAQCategory; item: FAQItem }[] = [];
  for (const cat of FAQ) {
    for (const item of cat.items) {
      if (
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q)
      ) {
        results.push({ category: cat, item });
      }
    }
  }
  return results;
}

// ── Components ───────────────────────────────────────────────────────────────

function SearchResult({
  item,
  categoryTitle,
}: {
  item: FAQItem;
  categoryTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left px-5 py-4 hover:bg-white/[0.03] transition"
    >
      <p className="text-[10px] uppercase tracking-widest text-white/20 font-medium mb-1.5">
        {categoryTitle}
      </p>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-white/80">{item.q}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/20 shrink-0 mt-0.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </div>
      {open && (
        <p className="text-sm text-white/40 leading-relaxed mt-3 pr-6">
          {item.a}
        </p>
      )}
    </button>
  );
}

function CategoryCard({
  category,
  onClick,
}: {
  category: FAQCategory;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left p-5 bg-white/[0.02] border border-white/[0.06] rounded-2xl hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <span className="text-white/30 group-hover:text-white/50 transition-colors">
          {category.icon}
        </span>
        <ChevronRight
          className="h-4 w-4 text-white/10 group-hover:text-white/30 transition-colors"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="text-[15px] font-semibold text-white/85 mt-4 mb-1">
        {category.title}
      </h3>
      <p className="text-sm text-white/30 leading-relaxed">
        {category.description}
      </p>
    </button>
  );
}

function CategoryDetail({ category }: { category: FAQCategory }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-white/40">{category.icon}</span>
        <div>
          <h2 className="text-xl font-semibold text-white/90">
            {category.title}
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            {category.items.length} article{category.items.length !== 1 && "s"}
          </p>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
        {category.items.map((item, i) => {
          const isOpen = openIdx === i;
          return (
            <button
              key={i}
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="w-full text-left px-5 py-4 hover:bg-white/[0.03] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/75">{item.q}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-white/20 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.5}
                />
              </div>
              {isOpen && (
                <p className="text-sm text-white/40 leading-relaxed mt-3 pr-6">
                  {item.a}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => searchFAQ(query), [query]);
  const activeCat = FAQ.find((c) => c.id === activeCategory) ?? null;

  const isSearching = query.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 w-full">
          {activeCategory || isSearching ? (
            <button
              onClick={() => {
                setActiveCategory(null);
                setQuery("");
              }}
              className="inline-flex items-center gap-1.5 text-white/25 hover:text-white/50 text-sm transition mb-8"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Back to Help Center
            </button>
          ) : (
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-white/25 hover:text-white/50 text-sm transition mb-8"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Home
            </Link>
          )}

          <h1 className="text-[28px] font-bold text-white/90 tracking-tight mb-2">
            What can we help you find?
          </h1>
          <p className="text-sm text-white/30 mb-6">
            Search our help articles or browse by topic below.
          </p>

          {/* Search bar */}
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20"
              strokeWidth={1.5}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setActiveCategory(null);
              }}
              placeholder="Search help articles..."
              className="w-full pl-11 pr-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-white/15 focus:bg-white/[0.06] transition"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 hover:text-white/50 transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
        {/* Search results */}
        {isSearching && (
          <div>
            <p className="text-xs text-white/25 mb-4">
              {searchResults.length} result
              {searchResults.length !== 1 && "s"} for &ldquo;{query}&rdquo;
            </p>
            {searchResults.length > 0 ? (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                {searchResults.map(({ category, item }, i) => (
                  <SearchResult
                    key={i}
                    item={item}
                    categoryTitle={category.title}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-white/30 mb-1">
                  No results found.
                </p>
                <p className="text-sm text-white/20">
                  Try a different search term or{" "}
                  <a
                    href="mailto:support@orryon.com"
                    className="text-white/40 underline underline-offset-2 hover:text-white/60 transition"
                  >
                    contact support
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        )}

        {/* Category detail view */}
        {!isSearching && activeCat && (
          <CategoryDetail category={activeCat} />
        )}

        {/* Topic grid (home state) */}
        {!isSearching && !activeCat && (
          <>
            <h2 className="text-xs uppercase tracking-widest text-white/20 font-semibold mb-4">
              Browse by topic
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
              {FAQ.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  onClick={() => setActiveCategory(category.id)}
                />
              ))}
            </div>

            {/* ── Resources ────────────────────────────────────────────── */}
            <h2 className="text-xs uppercase tracking-widest text-white/20 font-semibold mb-4">
              Resources
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
              <a
                href="/contact"
                className="flex items-center gap-3.5 px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition"
              >
                <MessageSquare
                  className="h-4 w-4 text-white/30 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0">
                  <p className="text-sm text-white/70 font-medium">
                    Send Feedback
                  </p>
                  <p className="text-xs text-white/25">
                    Report a bug or share an idea
                  </p>
                </div>
              </a>
              <a
                href="mailto:support@orryon.com"
                className="flex items-center gap-3.5 px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition"
              >
                <Mail
                  className="h-4 w-4 text-white/30 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0">
                  <p className="text-sm text-white/70 font-medium">
                    Email Support
                  </p>
                  <p className="text-xs text-white/25">support@orryon.com</p>
                </div>
              </a>
              <a
                href="/terms"
                className="flex items-center gap-3.5 px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition"
              >
                <FileText
                  className="h-4 w-4 text-white/30 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0">
                  <p className="text-sm text-white/70 font-medium">
                    Terms of Service
                  </p>
                  <p className="text-xs text-white/25">
                    Usage terms and policies
                  </p>
                </div>
              </a>
              <a
                href="/privacy"
                className="flex items-center gap-3.5 px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition"
              >
                <Lock
                  className="h-4 w-4 text-white/30 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0">
                  <p className="text-sm text-white/70 font-medium">
                    Privacy Policy
                  </p>
                  <p className="text-xs text-white/25">
                    How we handle your data
                  </p>
                </div>
              </a>
            </div>

            {/* ── Contact CTA ──────────────────────────────────────────── */}
            <div className="p-6 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-center">
              <p className="text-sm text-white/60 mb-1">Still need help?</p>
              <p className="text-sm text-white/25 mb-4">
                We typically respond within 24 hours.
              </p>
              <PillLink href="mailto:support@orryon.com" size="sm">
                Contact support
              </PillLink>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
