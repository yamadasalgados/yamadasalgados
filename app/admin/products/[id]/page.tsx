import {
  redirect,
} from "next/navigation";

export default function LegacyAdminProductDetailPage() {
  redirect("/admin/products");
}
