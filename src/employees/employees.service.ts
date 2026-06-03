import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto, companyId?: string | null) {
    if (!companyId) {
      throw new BadRequestException('companyId is required to create an employee');
    }

    if (dto.type === "ATTENDANT") {
      // Validate email is present for attendants
      if (!dto.email) {
        throw new BadRequestException(
          "Email is required for ATTENDANT employees",
        );
      }

      // Check if email already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException("Email already exists");
      }

      // Check if idNumber already exists
      const existingIdNumber = await this.prisma.user.findUnique({
        where: { idNumber: dto.idNumber },
      });

      if (existingIdNumber) {
        throw new BadRequestException("ID number already exists");
      }

      // Hash password using idNumber
      const password = await bcrypt.hash(dto.idNumber, 10);

      // Create User with ATTENDANT role
      const attendant = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          idNumber: dto.idNumber,
          password,
          role: UserRole.ATTENDANT,
          ...(companyId ? { companyUsers: { create: { companyId } } } : {}),
        },
      });

      return {
        id: attendant.id,
        name: attendant.name,
        idNumber: attendant.idNumber,
        type: "ATTENDANT" as const,
        email: attendant.email,
        photoUrl: attendant.photoUrl,
      };
    }

    if (dto.type === "VALET") {
      // Create Valet
      const valet = await this.prisma.valet.create({
        data: {
          name: dto.name,
          idNumber: dto.idNumber,
          companyId,
        },
      });

      return {
        id: valet.id,
        name: valet.name,
        idNumber: valet.idNumber,
        type: "VALET" as const,
      };
    }

    throw new BadRequestException("Invalid employee type");
  }

  async getAll(companyIds: string[] = []) {
    const hasCompanyFilter = companyIds.length > 0;
    const [valets, users] = await Promise.all([
      this.prisma.valet.findMany({
        where: hasCompanyFilter ? { companyId: { in: companyIds } } : {},
        orderBy: { name: "asc" },
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          role: { in: [UserRole.ATTENDANT, UserRole.MANAGER] },

          ...(hasCompanyFilter
            ? { companyUsers: { some: { companyId: { in: companyIds } } } }
            : {}),
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const valetRecords = valets.map((v) => ({
      id: v.id,
      name: v.name,
      idNumber: v.idNumber,
      type: "VALET" as const,
    }));

    const usersRecords = users.map((a) => ({
      id: a.id,
      name: a.name || "",
      type: a.role,
      idNumber: a.idNumber || "",
      email: a.email,
      photoUrl: a.photoUrl,
    }));

    return [...valetRecords, ...usersRecords];
  }

  async delete(id: string, type: "VALET" | "ATTENDANT" | "MANAGER") {
    if (type === "VALET") {
      const valet = await this.prisma.valet.findUnique({ where: { id } });
      if (!valet) {
        throw new NotFoundException("Valet not found");
      }
      await this.prisma.valet.delete({ where: { id } });
      return { message: "Valet deleted successfully" };
    }

    if (type === "ATTENDANT" || type === "MANAGER") {
      const employee = await this.prisma.user.findUnique({ where: { id } });
      if (
        !employee ||
        !([UserRole.ATTENDANT, UserRole.MANAGER] as UserRole[]).includes(employee.role as UserRole)
      ) {
        throw new NotFoundException("Employee not found");
      }
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return { message: "Employee deleted successfully" };
    }

    throw new BadRequestException("Invalid employee type");
  }
}
