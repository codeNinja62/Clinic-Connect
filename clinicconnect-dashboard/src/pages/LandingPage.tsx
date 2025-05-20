// src/pages/LandingPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container mx-auto py-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl items-center">
            <div className="hero-content">
              <h1 className="hero-title mb-lg">
                <span className="text-primary">Healthcare</span> at your fingertips
              </h1>
              <p className="hero-text mb-xl">
                Schedule appointments with top healthcare providers, access your medical 
                records, and manage your family's health all in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-md">
                <Link to="/login" className="btn btn-primary btn-lg">
                  Get Started
                </Link>
                <Link to="/find-care" className="btn btn-outline btn-lg">
                  Find Doctors
                </Link>
              </div>
            </div>
            <div className="hero-image-container hidden md:flex justify-end">
              <img 
                src="https://images.unsplash.com/photo-1666214280557-f1b5022eb634?q=80&w=1170&auto=format&fit=crop" 
                alt="Doctor with patient"
                className="hero-image rounded-lg shadow-lg" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section py-2xl bg-primary-light">
        <div className="container mx-auto">
          <h2 className="text-center text-xl font-bold mb-xl">Why Choose Clinic Connect?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            <div className="feature-card">
              <div className="feature-icon text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v16"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-sm">Easy Appointment Booking</h3>
              <p>Book appointments with just a few clicks, choose your preferred doctor and time slot.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  <path d="M9 12h6"></path>
                  <path d="M9 16h6"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-sm">Medical History Access</h3>
              <p>Access your medical records, prescriptions, and test results anytime, anywhere.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon text-tertiary">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-sm">Reminders & Notifications</h3>
              <p>Receive timely reminders for upcoming appointments and important health checkups.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works py-2xl">
        <div className="container mx-auto">
          <h2 className="text-center text-xl font-bold mb-lg">How It Works</h2>
          <p className="text-center text-muted mb-xl max-w-3xl mx-auto">
            Getting the healthcare you need has never been easier. Our simple process ensures you can find and book appointments with the right specialists quickly.
          </p>

          <div className="steps-container">
            <div className="step active">
              <div className="step-number">1</div>
              <h3 className="step-title">Create an account</h3>
              <p className="step-description">Sign up and create your health profile with basic information.</p>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">2</div>
              <h3 className="step-title">Find a doctor</h3>
              <p className="step-description">Search for doctors by specialty, location, or availability.</p>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">3</div>
              <h3 className="step-title">Book appointment</h3>
              <p className="step-description">Select a convenient time slot and confirm your appointment.</p>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">4</div>
              <h3 className="step-title">Visit doctor</h3>
              <p className="step-description">Receive reminders and attend your appointment on time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials py-2xl bg-primary-light">
        <div className="container mx-auto">
          <h2 className="text-center text-xl font-bold mb-xl">What Our Users Say</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div className="testimonial-card">
              <div className="testimonial-content">
                <p>"Clinic Connect has made managing my family's healthcare so much easier. I can book appointments for my children and elderly parents all from one account."</p>
              </div>
              <div className="testimonial-author">
                <div className="testimonial-avatar">
                  <div className="testimonial-avatar-placeholder">SA</div>
                </div>
                <div className="testimonial-info">
                  <h4 className="testimonial-name">Sarah A.</h4>
                  <p className="testimonial-title">Patient</p>
                </div>
              </div>
            </div>
            
            <div className="testimonial-card">
              <div className="testimonial-content">
                <p>"As a busy professional, I appreciate how quick and easy it is to find available slots that work with my schedule. No more waiting on hold to book appointments!"</p>
              </div>
              <div className="testimonial-author">
                <div className="testimonial-avatar">
                  <div className="testimonial-avatar-placeholder">MJ</div>
                </div>
                <div className="testimonial-info">
                  <h4 className="testimonial-name">Michael J.</h4>
                  <p className="testimonial-title">Patient</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section py-xl">
        <div className="container mx-auto">
          <div className="cta-card">
            <h2 className="cta-title">Ready to take control of your healthcare?</h2>
            <p className="cta-text">Join thousands of patients who are already enjoying the convenience of Clinic Connect.</p>
            <Link to="/signup" className="btn btn-primary btn-lg mt-lg">
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="app-footer">
        <div className="container mx-auto">
          <div className="footer-content">
            <div className="app-logo-text mb-lg">ClinicConnect</div>
            <div className="footer-links mb-md">
              <Link to="/about" className="footer-link">About</Link>
              <Link to="/contact" className="footer-link">Contact</Link>
              <Link to="/privacy" className="footer-link">Privacy Policy</Link>
              <Link to="/terms" className="footer-link">Terms of Service</Link>
            </div>
            <div className="footer-copyright">
              &copy; {new Date().getFullYear()} Clinic Connect. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
