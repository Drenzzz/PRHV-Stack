import { useEffect, useState } from "react";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { formString } from "../../../lib/form";

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  stock: number;
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID").format(price);
}

export default function Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  async function refresh() {
    const response = await fetch("/api/products");
    if (response.ok) setProducts(await response.json());
  }

  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(item: Product) {
    setEditing(item);
    setDialogOpen(true);
  }

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    const payload = {
      name: formString(form, "name"),
      price: Number(formString(form, "price")),
      stock: Number(formString(form, "stock")),
    };
    const response = await fetch(
      editing ? `/api/products/${editing.id}` : "/api/products",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      toast.error(editing ? "Failed to update product." : "Failed to create product.");
      return;
    }
    toast.success(editing ? "Product updated." : "Product created.");
    setDialogOpen(false);
    refresh();
  }

  async function handleDelete(item: Product) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    const response = await fetch(`/api/products/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Failed to delete product.");
      return;
    }
    toast.success("Product deleted.");
    refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 lg:gap-6 lg:p-6 lg:pt-0">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Products</CardTitle>
            <CardDescription>Live CRUD example backed by Postgres.</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <IconPlus />
            Add product
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.slug}</TableCell>
                  <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
                  <TableCell className="text-right">{item.stock}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}>
                      <IconPencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(item)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <IconTrash />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No products yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent key={editing?.id ?? "new"}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the product details below." : "Fill in the product details below."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="product-name">Name</Label>
              <Input id="product-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="product-price">Price</Label>
                <Input
                  id="product-price"
                  name="price"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editing?.price ?? ""}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="product-stock">Stock</Label>
                <Input
                  id="product-stock"
                  name="stock"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editing?.stock ?? ""}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save changes" : "Create product"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
