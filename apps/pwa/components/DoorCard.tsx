type DoorCardProps = {
  title: string;
  description: string;
  href: string;
  cta: string;
  benefits: string[];
};

export function DoorCard({ title, description, href, cta, benefits }: DoorCardProps) {
  return (
    <a className="doorCard" href={href}>
      <div>
        <p className="doorLabel">Quick check · about 2 minutes</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <ul>
          {benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
        </ul>
      </div>
      <span className="buttonLike">{cta} <span aria-hidden="true">→</span></span>
    </a>
  );
}
