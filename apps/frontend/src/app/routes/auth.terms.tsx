import LegalDocumentPage from '@app/components/legal/LegalDocumentPage'

export function meta() {
  return [
    { title: "Conditions générales d'utilisation - WhatsApp Agent" },
    {
      name: 'description',
      content:
        "Consultez les conditions générales d'utilisation de WhatsApp Agent.",
    },
  ]
}

export default function TermsPage() {
  return (
    <LegalDocumentPage
      eyebrow='CGU'
      title="Conditions générales d'utilisation"
      introduction="Les présentes conditions encadrent l'accès et l'usage de WhatsApp Agent. En utilisant l'application, vous confirmez agir pour votre activité et accepter un usage conforme à la loi, aux règles de WhatsApp et aux présentes conditions."
      updatedAt='21 mars 2026'
      sections={[
        {
          title: '1. Objet du service',
          paragraphs: [
            "WhatsApp Agent permet d'automatiser et d'assister certaines interactions commerciales autour de WhatsApp Business, notamment la gestion du contexte métier, l'assistance conversationnelle et, lorsque vous l'activez, la synchronisation de contacts avec des services tiers.",
          ],
        },
        {
          title: '2. Accès et compte',
          paragraphs: [
            "Vous êtes responsable des informations fournies lors de la connexion, de la sécurité de votre compte et de l'usage qui est fait de votre numéro WhatsApp Business, de votre configuration agent et de vos intégrations tierces.",
            "Vous devez disposer des droits nécessaires sur les données, contacts et canaux que vous utilisez dans l'application.",
          ],
        },
        {
          title: '3. Usage autorisé',
          paragraphs: [
            "Vous vous engagez à ne pas utiliser le service à des fins illégales, frauduleuses, trompeuses, abusives ou contraires aux politiques des plateformes connectées. Vous demeurez responsable des messages, contenus, règles métier et automatisations configurés depuis votre compte.",
            "Toute utilisation susceptible de nuire au service, à nos autres utilisateurs ou à des tiers peut entraîner la suspension ou la limitation de l'accès.",
          ],
        },
        {
          title: '4. Intégrations tierces',
          paragraphs: [
            "Certaines fonctionnalités dépendent de services tiers, notamment WhatsApp et Google. Leur disponibilité, leurs règles et leurs conditions peuvent évoluer sans préavis. Vous êtes responsable du maintien des autorisations nécessaires sur ces services.",
            "Lorsque vous connectez Google Contacts, vous nous autorisez à créer ou lier des contacts dans votre propre compte Google selon les règles de synchronisation prévues par l'application.",
          ],
        },
        {
          title: '5. Limitation et évolution du service',
          paragraphs: [
            "Le service est fourni avec une obligation de moyens. Nous pouvons corriger, modifier, suspendre ou faire évoluer certaines fonctionnalités pour des raisons techniques, de sécurité, de conformité ou d'amélioration produit.",
            "Sauf disposition contraire impérative, Bedones ne pourra être tenu responsable des pertes indirectes, des interruptions imputables à des tiers ou des conséquences d'une configuration fournie par l'utilisateur.",
          ],
        },
      ]}
    />
  )
}
