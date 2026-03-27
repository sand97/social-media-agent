import LegalDocumentPage from '@app/components/legal/LegalDocumentPage'

export function meta() {
  return [
    { title: 'Politique de confidentialité - WhatsApp Agent' },
    {
      name: 'description',
      content:
        'Consultez la politique de confidentialité de WhatsApp Agent et de Bedones.',
    },
  ]
}

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      eyebrow='Confidentialité'
      title='Politique de confidentialité'
      introduction="Cette politique décrit la manière dont Bedones collecte, utilise, sécurise et conserve les données traitées dans WhatsApp Agent, y compris les informations synchronisées avec Google Contacts lorsque vous activez cette fonctionnalité."
      updatedAt='21 mars 2026'
      sections={[
        {
          title: '1. Données concernées',
          paragraphs: [
            "Nous pouvons traiter vos informations de compte, votre numéro WhatsApp Business, les informations de profil associées, les paramètres de votre agent, les messages nécessaires au fonctionnement du service, ainsi que les données de contact que vous choisissez de synchroniser avec Google Contacts.",
            "Lorsque la synchronisation Google Contacts est activée, nous pouvons traiter le numéro de téléphone, le pseudo WhatsApp, le nom affiché, l'identifiant du chat et, si disponible, le nom de votre entreprise afin de créer ou relier le contact dans votre carnet Google.",
          ],
        },
        {
          title: '2. Finalités du traitement',
          paragraphs: [
            "Ces données sont utilisées pour authentifier votre accès, faire fonctionner l'agent WhatsApp, améliorer l'expérience de gestion commerciale, permettre la synchronisation optionnelle avec Google Contacts et assurer le support technique du service.",
            "Nous n'utilisons les données synchronisées que pour fournir les fonctionnalités demandées par l'utilisateur et pour maintenir la cohérence entre votre compte WhatsApp Agent, notre base interne et votre carnet Google.",
          ],
        },
        {
          title: '3. Partage et sous-traitance',
          paragraphs: [
            "Les données peuvent être transmises aux prestataires strictement nécessaires à l'exécution du service, notamment l'infrastructure d'hébergement, les services de base de données, WhatsApp et Google lorsque vous autorisez explicitement cette intégration.",
            "Les jetons OAuth Google sont chiffrés avant stockage dans notre infrastructure. Nous ne partageons pas ces jetons avec d'autres utilisateurs ni avec des tiers non nécessaires au fonctionnement du service.",
          ],
        },
        {
          title: '4. Conservation et sécurité',
          paragraphs: [
            "Nous appliquons des mesures techniques et organisationnelles raisonnables pour protéger les données contre l'accès non autorisé, la perte ou l'altération. Les accès sont limités aux besoins opérationnels du service.",
            "Les données sont conservées pendant la durée nécessaire à l'exploitation de votre compte, au respect de nos obligations légales et à la gestion des incidents. Vous pouvez demander la désactivation de la synchronisation Google Contacts à tout moment.",
          ],
        },
        {
          title: '5. Vos droits',
          paragraphs: [
            "Sous réserve du droit applicable, vous pouvez demander l'accès, la rectification, la suppression ou la limitation du traitement de vos données. Vous pouvez également retirer votre consentement à une intégration optionnelle comme Google Contacts en la déconnectant depuis l'application ou en contactant Bedones.",
            "Si vous estimez que vos données ne sont pas traitées conformément à vos attentes, vous pouvez également nous contacter afin que nous examinions votre demande.",
          ],
        },
      ]}
    />
  )
}
