import { auth } from "@/app/lib/firebase";

/**
 * Dispara uma requisição segura para a API Admin para remover um vendedor do ecossistema.
 */
export async function deleteSellerFromAdmin(sellerId: string, deleteUserAlso: boolean = true) {
  const user = auth.currentUser;
  if (!user) throw new Error("Acesso negado: Usuário não autenticado.");

  // Força a renovação do ID Token para garantir privilégios administrativos atualizados
  const idToken = await user.getIdToken(true);

  const res = await fetch("/api/admin/delete-seller", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ idToken, sellerId, deleteUserAlso }),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Falha silenciosa se o payload de resposta não for um JSON válido
  }

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Falha ao excluir vendedor (Status HTTP ${res.status})`);
  }

  return json;
}