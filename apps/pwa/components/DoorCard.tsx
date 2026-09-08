"use client";

import { Journey, trackEvent } from "../lib/api";

type DoorCardProps = {
  title: string;
  description: string;
  href: string;
  cta: string;
  journey: Journey;
};

export function DoorCard({ title, description, href, cta, journey }: DoorCardProps) {
  return (
    <a className="doorCard" href={href} onClick={() => trackEvent("door_selected", journey)}>
      <h2>{title}</h2>
      <p>{description}</p>
      <span>{cta} →</span>
    </a>
  );
}
