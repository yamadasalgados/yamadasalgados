import {
  redirect,
} from "next/navigation";

export default function LegacyAdminProductNewPage() {
  redirect("/admin/products");
}
