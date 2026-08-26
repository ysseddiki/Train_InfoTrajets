import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

/** Bascule clair / sombre — clair est le défaut produit. */
export function ThemeToggle({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "gate";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Passer en mode clair" : "Passer en mode sombre";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      className={
        variant === "gate"
          ? "theme-toggle theme-toggle-gate"
          : "sidebar-account-btn theme-toggle"
      }
      title={label}
      aria-label={label}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <Icon size={variant === "gate" ? 18 : 16} strokeWidth={2} aria-hidden />
      {variant === "sidebar" ? (
        <span className="sidebar-account-label">
          {isDark ? "Clair" : "Sombre"}
        </span>
      ) : (
        <span className="theme-toggle-gate-label">
          {isDark ? "Mode clair" : "Mode sombre"}
        </span>
      )}
    </button>
  );
}
