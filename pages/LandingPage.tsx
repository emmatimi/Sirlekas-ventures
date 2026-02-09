
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, InspirationalQuote } from '../types';
import { dbService } from '../services/dbService';

interface LandingPageProps {
  user: User | null;
}

const heroImages = [
  {
    url: 'https://ik.imagekit.io/4lndq5ke52/sir%20fresher%20welcome.jpeg?q=80&w=1350&auto=format&fit=crop',
    caption: 'Student digital hub at Sirlekas Ventures EKSU'
  },
  {
    url: 'https://ik.imagekit.io/4lndq5ke52/sir%20nysc%20reg.jpeg?q=80&w=1350&auto=format&fit=crop',
    caption: 'Accredited NYSC Registration Services in Ado-Ekiti'
  },
  {
    url: 'https://ik.imagekit.io/4lndq5ke52/sir%20relocation.jpeg?q=80&w=1350&auto=format&fit=crop',
    caption: 'Professional CBT Practice for University Students'
  },
  {
    url: 'https://ik.imagekit.io/4lndq5ke52/Screenshot%202026-02-05%20153909.png?q=80&w=1350&auto=format&fit=crop',
    caption: 'Official Digital Service Command Center at Ekiti State University'
  }
];

const services = [
  {
    title: 'Cyber Café Services EKSU',
    icon: 'fa-laptop-code',
    desc: 'High-speed internet, online course registration, and professional document processing conveniently located beside EKSU security unit.',
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
    action: 'whatsapp'
  },
  {
    title: 'NYSC Registration Ekiti',
    icon: 'fa-id-card',
    desc: 'Accredited center for official NYSC mobilization, green card processing, and relocation assistance for Ado-Ekiti graduates.',
    colorClass: 'text-indigo-600',
    bgClass: 'bg-indigo-50',
    action: 'whatsapp'
  },
  {
    title: 'Academic Writing & Projects',
    icon: 'fa-file-signature',
    desc: 'Expert assistance for EKSU final year projects, professional essays, and technical research documentation with zero plagiarism.',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    action: 'whatsapp'
  },
  {
    title: 'Professional Passport Studio',
    icon: 'fa-camera-retro',
    desc: 'Instant, high-resolution digital photography for all official international passport, visa, and university ID needs.',
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50',
    action: 'whatsapp'
  },
  {
    title: 'Creative Graphics Design',
    icon: 'fa-palette',
    desc: 'Modern branding, professional logo design for startups, corporate flyers, and digital visual concepts in Ekiti State.',
    colorClass: 'text-purple-600',
    bgClass: 'bg-purple-50',
    action: 'whatsapp'
  },
  {
    title: 'Clearance Processing',
    icon: 'fa-user-check',
    desc: 'Seamless assistance for EKSU final year clearance, faculty/departmental signatures, and Bursary verification for a stress-free graduation.',
    colorClass: 'text-cyan-600',
    bgClass: 'bg-cyan-50',
    action: 'whatsapp'
  },
  {
    title: 'High-Volume Printing',
    icon: 'fa-print',
    desc: 'Commercial digital printing, large format banners, and precise architectural plan printing at the best rates in EKSU.',
    colorClass: 'text-rose-600',
    bgClass: 'bg-rose-50',
    action: 'whatsapp'
  },
  {
    title: 'JAMB & GST CBT Hub',
    icon: 'fa-user-graduate',
    desc: 'Immersive CBT mock simulation for JAMB, WAEC, and Post-UTME for total academic mastery and high scores.',
    colorClass: 'text-[#0047AB]',
    bgClass: 'bg-blue-50',
    action: 'cbt'
  }
];

const LandingPage: React.FC<LandingPageProps> = ({ user }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeQuote, setActiveQuote] = useState<InspirationalQuote | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroImages.length);
    }, 5000);

    const fetchQuotes = async () => {
      const quotes = await dbService.getQuotes();
      if (quotes.length > 0) {
        setActiveQuote(quotes[Math.floor(Math.random() * quotes.length)]);
      }
    };
    fetchQuotes();

    return () => clearInterval(timer);
  }, []);

  const handleServiceClick = (service: typeof services[0]) => {
    if (service.action === 'cbt') {
      navigate(user ? '/dashboard' : '/auth');
    } else {
      const message = encodeURIComponent(`Hello Sirlekas Ventures, I'm interested in ${service.title}. Can you help me?`);
      window.open(`https://wa.me/+2347073992036?text=${message}`, '_blank');
    }
  };

  return (
    <article className="overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center bg-slate-50/50" aria-labelledby="hero-heading">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-50/50 rounded-bl-[100px]"></div>
        </div>

        <div className="max-w-[1440px] mx-auto px-4 lg:px-12 relative z-10 w-full py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left space-y-6 reveal">
              <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-700 px-4 py-1 rounded-full font-bold text-[10px] uppercase tracking-widest">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#FFD700] animate-pulse"></span>
                <span>C.A.C registered</span>
              </div>
              <h1 id="hero-heading" className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-[1.1] tracking-tight">
                Achieve Academic Excellence with <span className="gradient-text">Sirlekas Ventures</span>
              </h1>
              <p className="text-xl text-slate-600 max-w-lg leading-relaxed mx-auto lg:mx-0">
                Ekiti's premier destination for high-speed cyber café services, accredited NYSC registration, GST and advanced JAMB CBT practice exams directly beside EKSU.
              </p>
              <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-4">
                <Link 
                  to={user ? '/dashboard' : '/auth'} 
                  className="bg-[#0047AB] text-white px-8 py-4 rounded-2xl font-bold text-base hover:bg-blue-800 soft-shadow transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center"
                >
                  Start Practice Now <i className="fas fa-arrow-right ml-3 text-sm"></i>
                </Link>
                
                <Link
                  to="/cgpa-calculator"
                  className="bg-white border border-slate-200 text-slate-700 px-8 py-4 rounded-2xl font-bold text-base hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-calculator text-blue-500"></i>
                  Calculate CGPA
                </Link>

              </div>
            </div>

            <div className="relative reveal" style={{ transitionDelay: '0.2s' }}>
              <div className="absolute -inset-3 bg-blue-100 rounded-[2.5rem] -rotate-2"></div>
              <div className="relative bg-white rounded-[2rem] overflow-hidden p-2 soft-shadow">
                <div className="relative w-full aspect-[4/3] rounded-[1.5rem] overflow-hidden group">
                  {heroImages.map((img, idx) => (
                    <div 
                      key={idx}
                      className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentSlide ? 'opacity-100' : 'opacity-0'}`}
                    >
                      <img 
                        src={img.url} 
                        alt={img.caption} 
                        loading={idx === 0 ? "eager" : "lazy"}
                        className="w-full h-full object-cover transform transition-transform duration-[5s] scale-105 group-hover:scale-100"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-blue-900/60 to-transparent"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 bg-white overflow-hidden scroll-mt-20" aria-labelledby="about-heading">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-16 reveal">
            <div className="space-y-6">
              <div className="inline-flex items-center space-x-2 bg-slate-100 text-slate-700 px-4 py-1 rounded-full font-bold text-[16px] uppercase tracking-widest">
                <i className="fas fa-history text-blue-600"></i>
                <span>Our Heritage & Story</span>
              </div>
              <h2 id="about-heading" className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                From a Local Hub to a <span className="text-blue-600">Digital Powerhouse.</span>
              </h2>
              <div className="space-y-4 text-slate-600 text-lg leading-relaxed">
                <p>
                  Rooted in the heart of the community at <strong>Ekiti State University</strong>, Sirlekas Ventures emerged as a response to the growing gap in quality digital infrastructure. We recognized that students and small businesses needed more than just "access"—they needed excellence.
                </p>
                <p>
                  Located beside the <strong>EKSU Operation Unit along GT Bank road</strong>, our hub offers world-class Graphics Design, precision Printing, and the region's most realistic CBT examination environment.
                </p>
              </div>
              <div className="flex gap-8 pt-2">
                <div>
                  <div className="text-2xl font-black text-slate-900">EKSU</div>
                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">Our Location</p>
                </div>
                <div className="w-px h-10 bg-slate-100"></div>
                <div>
                  <div className="text-2xl font-black text-slate-900">2023</div>
                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">Digital Evolution</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-3 bg-slate-50 rounded-[2rem] rotate-2"></div>
              <img 
                src="https://ik.imagekit.io/4lndq5ke52/Screenshot%202026-02-07%20152448.png?q=80&w=1400&auto=format&fit=crop" 
                alt="Professional Digital Hub workspace" 
                className="relative z-10 w-full rounded-[1.5rem] shadow-xl grayscale hover:grayscale-0 transition-all duration-700"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 reveal">
            {[
              { 
                title: "Academic Integrity", 
                icon: "fa-shield-halved", 
                desc: "We build tools that foster genuine learning. Our CBT environments are designed to challenge and prepare students for success.",
                color: "bg-blue-600"
              },
              { 
                title: "Creative Precision", 
                icon: "fa-bezier-curve", 
                desc: "From logos to prints, we believe in the power of professional visual communication and attention to detail.",
                color: "bg-slate-900"
              },
              { 
                title: "Community Growth", 
                icon: "fa-seedling", 
                desc: "Our hub at EKSU is an open door for the next generation of scholars and creatives looking to excel.",
                color: "bg-[#0047AB]"
              }
            ].map((val, i) => (
              <div key={i} className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 group hover:-translate-y-1 transition-all duration-500">
                <div className={`w-10 h-10 ${val.color} rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform shadow-md`}>
                  <i className={`fas ${val.icon} text-sm`}></i>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{val.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{val.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20 bg-slate-50 relative scroll-mt-20" aria-labelledby="services-heading">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-12">
          <header className="text-center mb-12 reveal">
            <h2 className="text-[#0047AB] font-bold uppercase tracking-[0.2em] text-[10px] mb-2">Professional Service Catalog</h2>
            <h3 id="services-heading" className="text-3xl md:text-4xl font-black text-slate-900 mb-4">Expert Digital Solutions in Ado-Ekiti.</h3>
            <p className="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed">
              From creative graphics design and NYSC mobilization to professional architectural printing and JAMB mock exams.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {services.map((service, idx) => (
              <button 
                key={idx} 
                onClick={() => handleServiceClick(service)}
                className="group relative p-8 rounded-[2rem] bg-white border border-slate-100 hover:border-blue-100 hover:bg-slate-50 transition-all duration-500 text-left soft-shadow reveal flex flex-col h-full"
                style={{ transitionDelay: `${idx * 0.05}s` }}
              >
                <div className={`w-12 h-12 rounded-xl ${service.bgClass} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform flex-shrink-0`}>
                  <i className={`fas ${service.icon} text-xl ${service.colorClass}`} aria-hidden="true"></i>
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">{service.title}</h4>
                <p className="text-slate-500 text-base leading-relaxed mb-6 flex-grow">{service.desc}</p>
                <div className={`flex items-center text-[10px] font-black uppercase tracking-widest ${service.colorClass}`}>
                  Get Details <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Inspirational Quote */}
      {activeQuote && (
        <section className="py-12 bg-blue-50/20 text-center" aria-label="Daily Academic Inspiration">
          <div className="max-w-4xl mx-auto px-4 reveal">
            <i className="fas fa-quote-left text-blue-100 text-3xl mb-4" aria-hidden="true"></i>
            <blockquote className="text-2xl font-medium text-slate-800 leading-tight mb-6 italic">
              "{activeQuote.text}"
            </blockquote>
            <cite className="not-italic font-bold text-blue-600 uppercase tracking-widest text-[10px]">— {activeQuote.author.toUpperCase()}</cite>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 px-4" aria-labelledby="cta-heading">
        <div className="max-w-[1100px] mx-auto reveal">
          <div className="relative rounded-[2.5rem] bg-[#0047AB] p-10 md:p-14 overflow-hidden soft-shadow text-center">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/circuit-board.png')] opacity-5"></div>
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 id="cta-heading" className="text-3xl md:text-4xl font-black text-white mb-6">Ready to start your digital journey at EKSU?</h2>
              <p className="text-blue-100 text-lg mb-8 leading-relaxed">
                Whether you're seeking JAMB CBT mastery, NYSC registration in Ekiti, or premium graphics design, Sirlekas Ventures is your partner in excellence. Visit us beside the security unit today.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                  <Link to="/auth" className="inline-block bg-white text-blue-900 px-10 py-4 rounded-xl font-black text-base hover:shadow-2xl transition-all transform hover:-translate-y-1">
                    Access Portal
                  </Link>
                  <a href="https://wa.me/2347073992036" target="_blank" rel="noreferrer" className="inline-block border border-white/30 text-white px-10 py-4 rounded-xl font-black text-base hover:bg-white/10 transition-all">
                    Consult Expert
                  </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
};

export default LandingPage;
