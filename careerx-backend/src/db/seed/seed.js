// Usage: npm run seed
// Populates jobs_cache with mocked job listings so the Job Hub and
// Job Match engines are demo-able without a live LinkedIn/Indeed integration.
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';

const MOCK_JOBS = [
  {
    source: 'mock', title: 'Frontend Developer (React)', company: 'Zynovex Technologies',
    location: 'Pune, Maharashtra', is_remote: false, salary_min: 400000, salary_max: 700000,
    experience_required: '0-2 years', description: 'Build responsive UIs with React, TypeScript and Tailwind CSS for our SaaS product.',
    required_skills: ['React', 'TypeScript', 'CSS', 'Git'], posted_at: new Date().toISOString(),
  },
  {
    source: 'mock', title: 'Backend Developer (Node.js)', company: 'Meridian Softworks',
    location: 'Bengaluru, Karnataka', is_remote: true, salary_min: 500000, salary_max: 900000,
    experience_required: '1-3 years', description: 'Design and maintain REST APIs, work with PostgreSQL, and own service reliability.',
    required_skills: ['Node.js', 'Express', 'PostgreSQL', 'Docker'], posted_at: new Date().toISOString(),
  },
  {
    source: 'mock', title: 'Data Analyst', company: 'Insightra Analytics',
    location: 'Mumbai, Maharashtra', is_remote: false, salary_min: 350000, salary_max: 600000,
    experience_required: '0-1 years', description: 'Analyze business data using SQL and Python, build dashboards in Power BI.',
    required_skills: ['SQL', 'Python', 'Power BI', 'Excel'], posted_at: new Date().toISOString(),
  },
  {
    source: 'mock', title: 'DevOps Engineer', company: 'CloudForge Systems',
    location: 'Remote', is_remote: true, salary_min: 700000, salary_max: 1200000,
    experience_required: '2-4 years', description: 'Manage CI/CD pipelines, Kubernetes clusters, and cloud infrastructure on AWS.',
    required_skills: ['Docker', 'Kubernetes', 'AWS', 'Terraform'], posted_at: new Date().toISOString(),
  },
  {
    source: 'mock', title: 'Full Stack Developer', company: 'Nimbus Labs',
    location: 'Pune, Maharashtra', is_remote: true, salary_min: 450000, salary_max: 850000,
    experience_required: '1-2 years', description: 'Ship features end-to-end across a React frontend and Node.js backend.',
    required_skills: ['React', 'Node.js', 'PostgreSQL', 'REST APIs'], posted_at: new Date().toISOString(),
  },
];

async function seedJobs() {
  const { error } = await supabase.from('jobs_cache').insert(MOCK_JOBS);
  if (error) throw error;
  logger.info({ count: MOCK_JOBS.length }, 'seeded mock jobs');
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn('Skipping admin seed; set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD explicitly for a non-production seed.');
    return;
  }
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  if (users.users.some((user) => user.email?.toLowerCase() === email)) {
    logger.info('admin user already exists, skipping');
    return;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { full_name: 'CareerX Admin' },
  });
  if (error) throw error;
  await supabase.from('profiles').insert({ user_id: data.user.id, full_name: 'CareerX Admin' });
  logger.info({ email }, 'seeded admin user');
}

async function run() {
  await seedJobs();
  await seedAdminUser();
  logger.info('Seeding complete.');
}

run().catch((err) => {
  logger.error({ err: err.message }, 'seeding failed');
  process.exit(1);
});
