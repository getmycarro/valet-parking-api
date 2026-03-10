import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto, UpdateProfileDto, UpdateMeDto } from "./dto/update-user.dto";
import { FilterUsersDto } from "./dto/filter-users.dto";
import { Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  idNumber: true,
  photoUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  companyUsers: {
    select: {
      company: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ── 1. Crear Admin (solo SUPER_ADMIN) ─────────────────
  async createAdmin(dto: CreateUserDto) {
    await this.validateUniqueFields(dto.email, dto.idNumber);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: UserRole.ADMIN,
        phone: dto.phone,
        idNumber: dto.idNumber,
        companyUsers: {
          create: dto.companyIds.map((companyId) => ({ companyId })),
        },
      },
      select: USER_SELECT,
    });
  }

  // ── 2. Crear Staff (SUPER_ADMIN o ADMIN) ──────────────
  async createStaff(dto: CreateUserDto, currentUser: any) {
    if (dto.role !== UserRole.MANAGER && dto.role !== UserRole.ATTENDANT) {
      throw new BadRequestException(
        "Only MANAGER or ATTENDANT roles are allowed",
      );
    }

    // Si es ADMIN, validar que los companyIds pertenezcan a sus companies
    if (currentUser.role === UserRole.ADMIN) {
      const adminCompanyIds = this.extractCompanyIds(currentUser);
      const invalidIds = dto.companyIds.filter(
        (id) => !adminCompanyIds.includes(id),
      );
      if (invalidIds.length > 0) {
        throw new ForbiddenException(
          "You can only assign users to your own companies",
        );
      }
    }

    await this.validateUniqueFields(dto.email, dto.idNumber);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        idNumber: dto.idNumber,
        companyUsers: {
          create: dto.companyIds.map((companyId) => ({ companyId })),
        },
      },
      select: USER_SELECT,
    });
  }

  // ── 3. Listar todos (SUPER_ADMIN) ─────────────────────
  async findAll(filters: FilterUsersDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filters);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: USER_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdmins() {
    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
      },
      select: USER_SELECT,
    });

    return {
      data: users,
    };
  }
  // ── 4. Listar mis empleados (ADMIN) ───────────────────
  async findMyEmployees(filters: FilterUsersDto, currentUser: any) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const adminCompanyIds = this.extractCompanyIds(currentUser);

    const baseWhere = this.buildWhereClause(filters);
    const where: Prisma.UserWhereInput = {
      ...baseWhere,
      id: { not: currentUser.id },
      role: filters.role ?? {
        in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT],
      },
      companyUsers: {
        some: {
          companyId: filters.companyId
            ? filters.companyId
            : { in: adminCompanyIds },
        },
      },
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: USER_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── 5. Editar usuario (SUPER_ADMIN) ───────────────────
  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (dto.email && dto.email !== user.email) {
      await this.validateUniqueFields(dto.email);
    }
    if (dto.idNumber && dto.idNumber !== user.idNumber) {
      await this.validateUniqueFields(undefined, dto.idNumber);
    }

    const { companyIds, ...userData } = dto;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...userData,
        ...(companyIds
          ? {
              companyUsers: {
                deleteMany: {},
                create: companyIds.map((companyId) => ({ companyId })),
              },
            }
          : {}),
      },
      select: USER_SELECT,
    });
  }

  // ── 6. Editar empleado (ADMIN) ────────────────────────
  async updateEmployee(id: string, dto: UpdateUserDto, currentUser: any) {
    const adminCompanyIds = this.extractCompanyIds(currentUser);

    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      include: { companyUsers: true },
    });

    if (!targetUser) throw new NotFoundException("User not found");

    const sharedCompany = targetUser.companyUsers.some((cu) =>
      adminCompanyIds.includes(cu.companyId),
    );
    if (!sharedCompany) {
      throw new ForbiddenException(
        "You can only edit users within your companies",
      );
    }

    if (dto.email && dto.email !== targetUser.email) {
      await this.validateUniqueFields(dto.email);
    }
    if (dto.idNumber && dto.idNumber !== targetUser.idNumber) {
      await this.validateUniqueFields(undefined, dto.idNumber);
    }

    // ADMIN solo puede reasignar companies dentro de las suyas
    const { companyIds, isActive: _isActive, ...safeData } = dto;

    let companyUpdate = {};
    if (companyIds) {
      const invalidIds = companyIds.filter(
        (cid) => !adminCompanyIds.includes(cid),
      );
      if (invalidIds.length > 0) {
        throw new ForbiddenException(
          "You can only assign users to your own companies",
        );
      }
      companyUpdate = {
        companyUsers: {
          deleteMany: { companyId: { in: adminCompanyIds } },
          create: companyIds.map((companyId) => ({ companyId })),
        },
      };
    }

    return this.prisma.user.update({
      where: { id },
      data: { ...safeData, ...companyUpdate },
      select: USER_SELECT,
    });
  }

  // ── 7. Editar mi perfil ───────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        phone: dto.phone,
        photoUrl: dto.photoUrl,
      },
      select: USER_SELECT,
    });
  }

  // ── 8. Editar mi cuenta (password, idNumber, name) ────
  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required to change password');
      }
      const isValid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!isValid) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    if (dto.idNumber && dto.idNumber !== user.idNumber) {
      await this.validateUniqueFields(undefined, dto.idNumber);
    }

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.idNumber) updateData.idNumber = dto.idNumber;
    if (dto.newPassword) updateData.password = await bcrypt.hash(dto.newPassword, 10);

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT,
    });
  }

  // ── Helpers ───────────────────────────────────────────
  private extractCompanyIds(user: any): string[] {
    return (
      user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) ?? []
    );
  }

  private buildWhereClause(filters: FilterUsersDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (filters.role) where.role = filters.role;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    if (filters.companyId) {
      where.companyUsers = { some: { companyId: filters.companyId } };
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { idNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return where;
  }

  private async validateUniqueFields(email?: string, idNumber?: string) {
    if (email) {
      const existing = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existing) {
        throw new BadRequestException("Email already exists");
      }
    }

    if (idNumber) {
      const existing = await this.prisma.user.findUnique({
        where: { idNumber },
      });
      if (existing) {
        throw new BadRequestException("ID number already exists");
      }
    }
  }
}
