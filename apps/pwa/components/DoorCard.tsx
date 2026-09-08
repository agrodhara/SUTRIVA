type DoorCardProps = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

export function DoorCard({ title, description, href, cta }: DoorCardProps) {
  return (
    <a className="doorCard" href={href}>
      <h2>{title}</h2>
      <p>{description}</p>
      <span>{cta} →</span>
    </a>
  );
}
