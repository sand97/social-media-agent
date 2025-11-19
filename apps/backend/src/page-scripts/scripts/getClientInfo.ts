/**
 * Script de récupération des informations du compte WhatsApp Business
 * Ce script est exécuté dans le contexte de la page WhatsApp Web
 *
 * Variables injectées :
 * - BACKEND_URL: URL du backend
 * - TOKEN: Token JWT d'authentification (contient le clientId signé)
 *
 * IMPORTANT: Le clientId n'est PAS une variable car il est extrait du token
 * côté backend pour des raisons de sécurité.
 */

/* eslint-disable no-undef */
// @ts-nocheck - Ce code s'exécute dans le navigateur, pas dans Node.js

(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';

  console.log('🔍 Démarrage de la récupération des informations du client...');

  try {
    // Récupérer l'ID de l'utilisateur
    const userId = window.WPP.conn?.getMyUserId()?._serialized || '';

    if (!userId) {
      throw new Error('User ID not found');
    }

    console.log('📱 Récupération des informations du profil...');

    // 1. Vérifier si c'est un compte business
    const isBusiness = await window.WPP.profile.isBusiness();
    console.log(`✅ Compte business: ${isBusiness}`);

    // 2. Récupérer le nom du profil
    const profileName = await window.WPP.profile.getMyProfileName();
    console.log(`✅ Nom du profil: ${profileName}`);

    // Initialiser les données du client
    const clientInfo = {
      isBusiness,
      profileName,
      whatsappId: userId,
    };

    // 3. Si c'est un compte business, récupérer les informations business
    if (isBusiness) {
      console.log('🏢 Récupération des informations business...');

      const businessProfile = await window.WPP.contact.getBusinessProfile(userId);

      if (businessProfile?.attributes) {
        const attrs = businessProfile.attributes;

        clientInfo.businessProfile = {
          tag: attrs.tag,
          description: attrs.description,
          categories: attrs.categories,
          profileOptions: attrs.profileOptions,
          email: attrs.email,
          website: attrs.website,
          latitude: attrs.latitude,
          longitude: attrs.longitude,
          businessHours: attrs.businessHours,
        };

        console.log('✅ Informations business récupérées');
      }
    }

    // 4. Récupérer l'avatar
    console.log('🖼️ Récupération de l\'avatar...');
    const profilePicture = await window.WPP.profile.getMyProfilePicture();

    if (profilePicture?.attributes?.eurl) {
      const avatarUrl = profilePicture.attributes.eurl;
      console.log('✅ Avatar trouvé, téléchargement...');

      try {
        // Télécharger l'avatar dans le navigateur
        const response = await fetch(avatarUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'User-Agent': navigator.userAgent,
            'Referer': 'https://web.whatsapp.com/',
            'Origin': 'https://web.whatsapp.com',
          },
        });

        if (response.ok) {
          const blob = await response.blob();

          if (blob.size > 0) {
            // Détecter l'extension de l'image
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const extension = contentType.split('/')[1] || 'jpg';

            // Convertir le blob en base64 pour l'envoyer via nodeFetch
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            const base64Data = await base64Promise;

            // Envoyer l'avatar au backend via nodeFetch (contourne la CSP)
            const uploadResponse = await window.nodeFetch(`${BACKEND_URL}/catalog/upload-avatar`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                avatar: base64Data,
                filename: `avatar.${extension}`,
                originalUrl: avatarUrl,
              }),
            });

            if (uploadResponse.ok) {
              const uploadResult = await uploadResponse.json();
              clientInfo.avatarUrl = uploadResult.data?.url || uploadResult.url;
              console.log('✅ Avatar uploadé avec succès');
            } else {
              console.error('❌ Erreur lors de l\'upload de l\'avatar');
            }
          } else {
            console.warn('⚠️ Avatar vide, ignoré');
          }
        } else {
          console.error(`❌ Erreur HTTP ${response.status} lors du téléchargement de l'avatar`);
        }
      } catch (avatarError) {
        console.error('❌ Erreur lors du traitement de l\'avatar:', avatarError.message);
      }
    } else {
      console.log('ℹ️ Pas d\'avatar trouvé');
    }

    // 5. Envoyer toutes les informations au backend via nodeFetch (contourne la CSP)
    console.log('📤 Envoi des informations au backend...');

    const saveResponse = await window.nodeFetch(`${BACKEND_URL}/catalog/save-client-info`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clientInfo),
    });

    if (saveResponse.ok) {
      console.log('✅ Informations du client sauvegardées avec succès');
    } else {
      console.error('❌ Erreur lors de la sauvegarde des informations du client');
    }

    return {
      success: true,
      clientInfo,
    };
  } catch (error) {
    console.error('❌ Erreur récupération des informations du client:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
})();
