"use client";

import { Journey, trackEvent } from "../lib/api";
import { SituationIcon } from "../app/situations/SituationIcon";

type DoorCardProps = {
  optionLabel: string;
  title: string;
  description: string;
  benefits: string[];
  timeEstimate: string;
  href: string;
  cta: string;
  journey: Journey;
  accent: "moneyValue" | "borrowBetter";
};

export function DoorCard({
  optionLabel,
  title,
  description,
  benefits,
  timeEstimate,
  href,
  cta,
  journey,
  accent,
}: DoorCardProps) {
  return (
    <div className={`doorCard doorCard--${accent}`}>
      <span className="doorCard__icon"><SituationIcon name={accent === "borrowBetter" ? "borrow" : "rewards"} size={34} /></span>
      <p className="doorCard__option">{optionLabel}</p>
      <h2>{title}</h2>
      <p className="doorCard__description">{description}</p>
      <ul className="doorCard__benefits">
        {benefits.map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      <a
        className="doorCard__cta"
        href={href}
        aria-label={`Open ${title}`}
        onClick={() => trackEvent("door_selected", journey)}
      >
        {cta} →
      </a>
      <p className="doorCard__time">{timeEstimate}</p>
    </div>
  );
}
