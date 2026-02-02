import { useState, useEffect, useRef } from "react";

interface ScrollRevealSectionProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
}

// Scroll-reveal section wrapper
export default function ScrollRevealSection({
  id,
  className = "",
  children,
}: ScrollRevealSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "-50px" }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={`whitepaper__section ${isVisible ? "whitepaper__section--visible" : ""} ${className}`}
    >
      {children}
    </section>
  );
}
