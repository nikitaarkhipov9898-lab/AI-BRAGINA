import { useState } from "react";
import { motion } from "framer-motion";
import {
  Home, Sparkles, Clapperboard, MessageCircle, CheckSquare, UserRound,
} from "lucide-react";

declare global {
  interface Window { showPage?: (page: string) => void }
}

const tabs = [
  { id: "home", label: "Главная", Icon: Home },
  { id: "helpers", label: "Агенты", Icon: Sparkles },
  { id: "video", label: "Видео", Icon: Clapperboard },
  { id: "community", label: "Чаты", Icon: MessageCircle },
  { id: "tasks", label: "Дела", Icon: CheckSquare },
  { id: "profile", label: "Профиль", Icon: UserRound },
];

export default function App() {
  const [active, setActive] = useState("home");

  const navigate = (id: string) => {
    setActive(id);
    window.showPage?.(id);
  };

  return (
    <nav className="soyuz-dock" aria-label="Основная навигация">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`soyuz-dock__item ${active === id ? "is-active" : ""}`}
          aria-current={active === id ? "page" : undefined}
          onClick={() => navigate(id)}
        >
          {active === id && (
            <motion.span
              className="soyuz-dock__indicator"
              layoutId="soyuz-active-tab"
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
            />
          )}
          <motion.span className="soyuz-dock__icon" whileTap={{ scale: 0.86 }}>
            <Icon size={19} strokeWidth={active === id ? 2.2 : 1.7} />
          </motion.span>
          <span className="soyuz-dock__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
