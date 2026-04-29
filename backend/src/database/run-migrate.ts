import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProductsService } from '../modules/products/products.service';
import { DataSource } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Branch } from '../entities/branch.entity';

async function bootstrap() {
  console.log('🔄 Loading NestJS Context for Migration...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const productsService = app.get(ProductsService);
  const dataSource = app.get(DataSource);

  const categoryRepo = dataSource.getRepository(Category);
  const branchRepo = dataSource.getRepository(Branch);

  console.log('Fetching existing new branches...');
  const branches = await branchRepo.find();
  const siyahiya = branches.find(b => b.nameEn.toLowerCase().includes('siyahiya') || b.name.includes('السياحية'));
  const nawfaliyeen = branches.find(b => b.nameEn.toLowerCase().includes('nawfaliyeen') || b.name.includes('النوفليين'));

  if (!siyahiya || !nawfaliyeen) {
      console.error('Cannot find target branches in new DB!');
      process.exit(1);
  }

  console.log(`Branch map: Seyhia(1001) -> ${siyahiya.id}, Nofliin(1002) -> ${nawfaliyeen.id}`);

  console.log('Fetching old API data...');
  const token = "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIxIiwiVXNlclJvbGVJZCI6IjMwMDEiLCJVc2VyU3RvcmFnZUlkIjoiMTAwMSIsImV4cCI6MTgwMjk2NTA1NiwiaXNzIjoiaHR0cHM6Ly9zdG9yZS50ZXBvY2xvdGhpbmcubHkiLCJhdWQiOiJodHRwczovL3N0b3JlLnRlcG9jbG90aGluZy5seSJ9.AND40ronM0Jv7SGBWPtaVMiWtMQdg_L3uC6_fDTmz6Q";
  
  const headers = {
      'accept': 'application/json',
      'authorization': token,
      'Referer': 'https://dash.outletmaster.ly/'
  };

  // 1. Fetch lookups to map Categories
  console.log('Fetching lookups...');
  const lookupRes = await fetch('https://api.outletmaster.ly/api/lookups', { headers });
  const lookupData = await lookupRes.json();
  const oldCategories = lookupData.lookups.filter((l: any) => l.type === 7); // Type 7 is categories
  
  const categoryMap = new Map<number, string>(); // old_id -> new_uuid
  for (const oc of oldCategories) {
      // Find or create category
      let cat = await categoryRepo.findOne({ where: { name: oc.label } });
      if (!cat) {
          cat = await categoryRepo.save(categoryRepo.create({ name: oc.label, description: oc.label }));
          console.log(`  + Created Category: ${oc.label}`);
      }
      categoryMap.set(oc.value, cat.id);
  }

  // 2. Fetch all products/stock in pages
  let allProducts: any[] = [];
  let page = 1;
  let totalFetched = 0;
  let totalItems = -1;

  while(true) {
      console.log(`Fetching stock page ${page}...`);
      const stockRes = await fetch(`https://api.outletmaster.ly/api/products/stock?pageSize=100&pageNumber=${page}`, { headers });
      if (!stockRes.ok) throw new Error(`HTTP Error: ${stockRes.status}`);
      const stockData = await stockRes.json();
      
      const items = stockData.products;
      if (!items || items.length === 0) break;

      allProducts = allProducts.concat(items);
      totalItems = stockData.totalItems || stockData.totals?.totalItems || totalItems;
      totalFetched += items.length;
      
      console.log(`  Got ${items.length} items (Total: ${totalFetched}/${totalItems || '?'})`);
      if (items.length < 100) break;
      page++;
  }

  console.log(`\nFound ${allProducts.length} total products to migrate.`);
  
  // 3. Migrate each product
  let migratedCount = 0;
  for (const oldProd of allProducts) {
      try {
            const newCatId = categoryMap.get(oldProd.category_id);
            
            // Map old variants to new variants format
            const variantsToCreate: any[] = [];
            const initialStockQuantities: any[] = [];
            
            // group old variants (since an old product might have same size multiple times for diff stores?)
            // old format: each variant row is a size in a SPECIFIC store_id.
            // new format: variant is size+color, then inventory is store->quantity linked to variant.
            // We need to merge variants by Attribute (size) + price
            
            // Map: "size_name + price" -> { variant, quantities: { branchId: qty } }
            const mergedVariants = new Map<string, any>();
            
            if (oldProd.variants) {
                for (const ov of oldProd.variants) {
                    const key = `${ov.variant_name}_${ov.price}_${ov.cost}`;
                    if (!mergedVariants.has(key)) {
                        mergedVariants.set(key, {
                            vData: {
                                size: ov.variant_name,
                                color: '', // None provided in API visibly?
                                sku: ov.sku || `OLD-${oldProd.product_id}-${ov.variant_id}`,
                                costPrice: ov.cost || 0,
                                salePrice: ov.price || 0, // In old API, price = regular price. sale_price was 0 or discount
                                // if sale_price > 0, we can map it to salePrice and regular price maybe?
                                // Our backend expects salePrice = actual selling price. 
                                // In old API, let's use `sale_price` if > 0, else `price`.
                                barcode: (ov.barcode || '').trim() || undefined
                            },
                            quantities: {}
                        });
                    }
                    
                    const merged = mergedVariants.get(key);
                    const branchId = ov.store_id === 1001 ? siyahiya.id : 
                                     ov.store_id === 1002 ? nawfaliyeen.id : 
                                     siyahiya.id; // default
                    
                    if (!merged.quantities[branchId]) {
                        merged.quantities[branchId] = 0;
                    }
                    merged.quantities[branchId] += (ov.stock || 0);
                }
            }

            for (const [key, mv] of mergedVariants.entries()) {
                variantsToCreate.push(mv.vData);
            }

            // We must create the product first, then manually add inventory since our API takes initialStock {branchId, quantities} 
            // but ONLY FOR ONE BRANCH at a time via `create()`. We have multiple branches potentially.

            // 1. Create product & variants
            const created = await productsService.create({
                name: oldProd.product_name,
                nameAr: oldProd.product_name,
                categoryId: newCatId,
                imageUrl: oldProd.image_url,
                variants: variantsToCreate,
                // We won't use initialStock here because we have multiple branches. We'll populate inventory manually.
            });

            // 2. Populate Inventory manually based on `merged` data
            let vIdx = 0;
            const invRepo = dataSource.getRepository('Inventory');
            for (const [key, mv] of mergedVariants.entries()) {
                const newVariant = created.variants[vIdx]; // variants are created in order they were passed
                if (!newVariant) continue;
                
                for (const [branchId, qty] of Object.entries(mv.quantities)) {
                    await invRepo.save({
                        variantId: newVariant.id,
                        branchId,
                        quantity: qty,
                        costUsd: 0,
                        costLydAtPurchase: newVariant.costPrice,
                        purchaseDate: new Date().toISOString().split('T')[0]
                    });
                }
                vIdx++;
            }
            
            migratedCount++;
            if (migratedCount % 50 === 0) {
                console.log(`Migrated ${migratedCount} / ${allProducts.length}`);
            }
      } catch (err: any) {
          console.error(`Failed to migrate product ${oldProd.product_id}:`, err.message);
      }
  }

  console.log(`\n🎉 FINISHED! Successfully migrated ${migratedCount} products.`);
  await app.close();
}
bootstrap();
