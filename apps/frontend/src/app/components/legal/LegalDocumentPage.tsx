import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { Link } from 'react-router-dom'

type LegalSection = {
  title: string
  paragraphs: string[]
}

interface LegalDocumentPageProps {
  eyebrow: string
  title: string
  introduction: string
  updatedAt: string
  sections: LegalSection[]
}

export default function LegalDocumentPage({
  eyebrow,
  title,
  introduction,
  updatedAt,
  sections,
}: LegalDocumentPageProps) {
  return (
    <div className='min-h-screen bg-[radial-gradient(circle_at_top,_rgba(36,211,102,0.12),_transparent_32%),linear-gradient(180deg,_#fcfbf8_0%,_#f5f4f1_100%)] text-text-dark'>
      <header className='sticky top-0 z-20 border-b border-[rgba(17,27,33,0.08)] bg-[rgba(252,251,248,0.92)] backdrop-blur-md'>
        <div className='mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6'>
          <Button
            type='primary'
            icon={<ArrowLeftOutlined />}
            href='/auth/login'
            className='!rounded-full !px-5'
          >
            Revenir à l&apos;application
          </Button>

          <p className='hidden text-right text-xs tracking-[0.18em] text-text-muted uppercase sm:block'>
            Document public
          </p>
        </div>
      </header>

      <main className='px-4 py-8 sm:px-6 sm:py-12'>
        <div className='mx-auto max-w-5xl'>
          <section className='mb-8 overflow-hidden rounded-[32px] border border-[rgba(17,27,33,0.08)] bg-[rgba(255,255,255,0.82)] p-6 shadow-[0px_20px_60px_rgba(17,27,33,0.08)] sm:p-10'>
            <p className='mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted'>
              {eyebrow}
            </p>
            <h1 className='max-w-3xl font-[Georgia] text-4xl leading-tight text-text-dark sm:text-5xl'>
              {title}
            </h1>
            <p className='mt-5 max-w-3xl text-base leading-8 text-text-muted sm:text-lg'>
              {introduction}
            </p>
            <div className='mt-8 inline-flex rounded-full border border-[rgba(17,27,33,0.08)] bg-[rgba(17,27,33,0.03)] px-4 py-2 text-xs font-medium tracking-[0.14em] text-text-muted uppercase'>
              Mise à jour : {updatedAt}
            </div>
          </section>

          <div className='grid gap-5'>
            {sections.map(section => (
              <article
                key={section.title}
                className='rounded-[28px] border border-[rgba(17,27,33,0.08)] bg-white px-6 py-6 shadow-card sm:px-8'
              >
                <h2 className='text-xl font-semibold tracking-[-0.02em] text-text-dark'>
                  {section.title}
                </h2>
                <div className='mt-4 grid gap-4 text-sm leading-7 text-text-muted sm:text-[15px]'>
                  {section.paragraphs.map(paragraph => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <footer className='mt-8 rounded-[24px] border border-[rgba(17,27,33,0.08)] bg-[rgba(255,255,255,0.78)] px-6 py-5 text-sm leading-7 text-text-muted shadow-card'>
            <p>
              Pour toute question liée à ces documents, contactez l&apos;équipe
              Bedones depuis l&apos;application ou par vos canaux de support
              habituels.
            </p>
            <div className='mt-3 flex flex-wrap gap-4'>
              <Link
                to='/auth/privacy'
                className='font-medium text-text-dark underline underline-offset-4 hover:text-primary-green'
              >
                Politique de confidentialité
              </Link>
              <Link
                to='/auth/terms'
                className='font-medium text-text-dark underline underline-offset-4 hover:text-primary-green'
              >
                Conditions générales d&apos;utilisation
              </Link>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}
